(function () {
  console.log('弹幕优化插件启动')
  String.prototype.pxWidth = function (font) {
    // re-use canvas object for better performance
    let canvas = String.prototype.pxWidth.canvas || (String.prototype.pxWidth.canvas = document.createElement("canvas")),
      context = canvas.getContext("2d");

    font && (context.font = font);
    let metrics = context.measureText(this);

    return metrics.width;
  }
  String.prototype.exchangeCharsFromZhToEn = function () {
    let s = this
    let map = new Map([
      ['：', ':'],
      ['。', '.'],
      ['“', '"'],
      ['”', '"'],
      ['【', '['],
      ['】', ']'],
      ['《', '<'],
      ['》', '>'],
      ['，', ','],
      ['？', '?'],
      ['、', ','],
      ['；', ';'],
      ['（', '('],
      ['）', ')'],
      ['‘', "'"],
      ['’', "'"],
      ['『', '['],
      ['』', ']'],
      ['「', '['],
      ['」', ']'],
      ['﹃', '['],
      ['﹄', ']'],
      ['〔', '{'],
      ['〕', '}'],
      ['—', '-'],
      ['·', '.'],
    ])
    s = s.split("");
    for (let i = 0; i < s.length; i++) {
      let temp = map.get(s[i])
      if (temp) {
        s[i] = temp
      }
      //全角空格处理
      else if (s[i].charCodeAt(0) === 12288) {
        s[i] = String.fromCharCode(32);
      }
      /*其他全角*/
      else if (s[i].charCodeAt(0) > 0xFF00 && s[i].charCodeAt(0) < 0xFFEF) {
        s[i] = String.fromCharCode(s[i].charCodeAt(0) - 65248);
      }
    }
    return s.join("");
  }
  String.prototype.trimUnusefulChars = (function () {
    let unusefulChars = new Set(["?", "!", ".", "\r"])
    return function () {
      let s = this
      let i = 0
      let j = s.length - 1
      while (i < s.length && unusefulChars.has(s[i])) {
        i++
      }
      while (j >= 0 && unusefulChars.has(s[j])) {
        j--
      }
      return i <= j ? s.slice(i, j + 1) : s
    }
  })()
  String.prototype.handleRepeatString = function () {
    let s = this
    let i = (s + s).slice(1, -1).indexOf(s)
    return i === -1 ? s : s.slice(0, i + 1)
  }

  class Danmaku {
    static globalStyle = {size: 27, color: '#fff', opacity: 0.4, speed: 100}
    static lineHeight = Danmaku.globalStyle.size * 1.2
    static mergeStyle = new Map([
      [3, 'chen-danmaku-merge-3'],
      [8, 'chen-danmaku-merge-8'],
      [15, 'chen-danmaku-merge-15'],
      [30, 'chen-danmaku-merge-30'],
    ])

    constructor(msg) {
      this.msg = msg
      this.feature = this.getFeatureString(msg).toString()
      // this.feature = Math.random()
      this.repeatCount = 1
      this.el = null
      this.addedClass = ''
      this.width = 0
      this.createTime = Date.now()
    }

    mount(boxElement, boxWidth, top) {
      const {size, color, opacity, speed} = Danmaku.globalStyle
      this.width = this.msg.pxWidth(`${size}px SimHei`)
      const duration = (boxWidth + this.width) / speed
      this.el = $(`<div class="chen-danmaku">${this.msg}</div>`)
      this.el.attr("style",
        `--size:${size}px;--color:${color};--opacity:${opacity};--top:${top}px;--duration:${duration}s;`)
      this.el.appendTo(boxElement)
      return duration
    }

    getFeatureString(msg) {
      return msg.exchangeCharsFromZhToEn().handleRepeatString()
        .trimUnusefulChars().handleRepeatString()
    }

    updateStyleAfterMerge() {
      const result = Danmaku.mergeStyle.get(this.repeatCount)
      if (result) {
        // fixme 可优化
        if (this.addedClass) this.el.removeClass(this.addedClass)
        this.el.addClass(result)
        this.addedClass = result
      }
    }

  }

  class Controller {
    constructor() {
      this.$box = $('<div class="chen-dm-box"></div>')
      this.boxWidth = 0
      this.boxHeight = 0
      this.readyToSend = []
      this.maxDelay = 5000
      this.danmakuUsingTop = []
      this.featureMap = new Map()
      this.mount()
      this.openSendCircle(300)
      this.dev()
    }

    mount() {
      // let intervalID = setInterval(() => {
      //   console.log('check')
      //   if (document.getElementById('live-player')) {
      //     mount()
      //     clearInterval(intervalID)
      //     console.log('mounted')
      //   }
      // }, 1000)
      this.$box.prependTo('#live-player')
      $('#chat-items').on('DOMNodeInserted', (e) => {
        const msg = e.target.dataset.danmaku
        if (msg) this.handleNewMsg(msg)
      })
      console.log('box mounted')

      new ResizeObserver(entries => {
        entries.forEach(entry => {
          this.boxWidth = entry.contentRect.width
          this.boxHeight = entry.contentRect.height
        })
      }).observe(this.$box[0])
    }

    handleNewMsg(msg) {
      const dm = new Danmaku(msg)
      if (this.mergeWhenRepeat(dm)) return
      this.readyToSend.push(dm)
    }

    mergeWhenRepeat(dm) {
      const item = this.featureMap.get(dm.feature)
      if (item) {
        // fixme 有改进空间
        const {target, timeStamp} = item
        if (timeStamp < Date.now()) {
          this.featureMap.delete(dm.feature)
          return false
        }
        target.el.text(`${target.msg}₍${this.turnNumberToSubscript(++target.repeatCount)}₎`)
        target.updateStyleAfterMerge()
        this.saveMergeHistory(dm.msg, target.msg)
        return true
      }
      return false
    }

    saveMergeHistory(origin, target) {
      chrome.storage.local.get(['mergeHistory'], (result) => {
        let value = result.mergeHistory
        if (!value) value = []
        let info = `已合并：${origin}  ==>  ${target}`
        if (value.indexOf(info) === -1) value.push(info)
        chrome.storage.local.set({'mergeHistory': value}, () => {
        })
      })
    }

    openSendCircle(time) {
      setInterval(() => {
        this.removeOvertimeMsgs()
        const tops = this.getFreeTops(this.readyToSend.length)
        const $fragment = $(document.createDocumentFragment())
        for (let top of tops) {
          const dm = this.readyToSend.shift()
          if (!dm) {
            break
          }
          if (this.mergeWhenRepeat(dm)) {
            continue
          }
          const duration = dm.mount($fragment, this.boxWidth, top)
          this.featureMap.set(dm.feature, {target: dm, timeStamp: Date.now() + duration * 1000})
          this.danmakuUsingTop.push({
            lower: top - 1,
            upper: top - 1 + Danmaku.lineHeight,
            timeStamp: Date.now() + (dm.width + 15) / Danmaku.globalStyle.speed * 1000
          })
          this.destroyDanmaku(dm, duration)
        }
        $fragment.appendTo(this.$box)
        if (tops.length > 0) {
          this.danmakuUsingTop.sort((a, b) => a.lower - b.lower)
        }
      }, time)
    }

    dev() {
      setInterval(() => {
        this.handleNewMsg('..赢！！')
        // console.log(liveDanmakus)
      }, 1000)
      setInterval(() => {
        this.handleNewMsg('赢')
        // console.log(liveDanmakus)
      }, 500)
      // setInterval(() => {
      //   this.handleNewMsg('测试')
      // }, 20)
      // setInterval(() => {
      //   handleDanmaku('嘉然？')
      //   // console.log(liveDanmakus)
      // }, 700)

      const $button1 = $('<button id="chen-getMergeHistory">打印</button>')
      const $button2 = $('<button id="chen-clearMergeHistory">清除</button>')
      $button1.click(() => {
        getMergeHistory().then((value) => {
          console.log(value)
        })
      })
      $button1.prependTo('body')
      $button2.click(clearMergeHistory)
      $button2.prependTo('body')
    }

    turnNumberToSubscript(num) {
      let arr = []
      while (num > 0) {
        arr.unshift(String.fromCharCode(8320 + num % 10))
        num = Math.floor(num / 10)
      }
      return arr.join('')
    }

    getFreeTops(num) {
      if (num === 0) return []
      const height = Danmaku.lineHeight + 1
      const result = []
      const now = Date.now()
      let top = 0
      let i = 0, len = this.danmakuUsingTop.length
      while (i < len && result.length < num) {
        const {lower, upper, timeStamp} = this.danmakuUsingTop[i]
        if (timeStamp < now) {
          this.danmakuUsingTop.splice(i, 1)
          len--
        } else if (Math.max(lower, top) < Math.min(upper, top + height)) {
          top = upper
          i++
        } else {
          if (top + height > this.boxHeight) {
            return result
          }
          result.push(top + 1)
          top += height
        }
      }
      while (result.length < num) {
        if (top + height > this.boxHeight) {
          return result
        }
        result.push(top + 1)
        top += height
      }
      return result
    }

    removeOvertimeMsgs() {
      const len = this.readyToSend.length
      const timeStamp = Date.now()
      let i = 0
      while (i < len) {
        if (this.readyToSend[i].createTime + this.maxDelay > timeStamp) break
        i++
      }
      this.readyToSend.splice(0, i)
    }

    destroyDanmaku(dm, duration) {
      setTimeout(() => {
        dm.el.remove()
      }, duration * 1000 + 100)
    }
  }

  async function getMergeHistory() {
    return await new Promise((resolve) => {
      chrome.storage.local.get(['mergeHistory'], (result) => {
        resolve(result.mergeHistory)
      })
    })
  }

  function clearMergeHistory() {
    chrome.storage.local.set({'mergeHistory': []}, () => {
    })
  }

  new Controller()
})()
