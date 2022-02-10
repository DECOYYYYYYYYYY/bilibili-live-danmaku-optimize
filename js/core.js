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
  String.prototype.exchangeCharsFromZhToEn = (function () {
    const map = new Map([
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
    return function () {
      let s = this
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
  })()
  String.prototype.trimUnusefulChars = (function () {
    const unusefulChars = new Set(["?", "!", ".", "\r"])
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
    static mergeStyle = [
      [3, 'chen-danmaku-merge-3'],
      [8, 'chen-danmaku-merge-8'],
      [15, 'chen-danmaku-merge-15'],
      [30, 'chen-danmaku-merge-30'],
    ]

    constructor(msg) {
      this.msg = msg
      this.feature = this.getFeatureString(msg).toString()
      // this.feature = msg==='合并' ? '合并' : Math.random()
      this.repeatCount = 1
      this.el = null
      this.addedClass = ''
      this.width = 0
      this.createTime = Date.now()
      this.sendedTime = 0
      this.top = 0
      this.duration = 0
    }

    mount(boxElement, top) {
      this.top = top
      this.sendedTime = Date.now()
      this.el = $(`<div class="chen-danmaku">${this.msg}</div>`)
      this.generateRollStyle()
      this.el.appendTo(boxElement)
    }

    getFeatureString(msg) {
      return msg.exchangeCharsFromZhToEn().handleRepeatString()
        .trimUnusefulChars().handleRepeatString()
    }

    updateStyleAfterMerge() {
      let result
      for (let [i, classString] of Danmaku.mergeStyle) {
        if (this.repeatCount < i) {
          break
        }
        result = classString
      }
      if (result) {
        if (this.addedClass) this.el.removeClass(this.addedClass)
        this.el.addClass(result)
        this.addedClass = result
      }
      if (String(this.repeatCount).length - String(this.repeatCount-1).length >= 1) {
        this.generateRollStyle()
      }
    }

    generateRollStyle(){
      const {size, color, opacity, speed} = Danmaku.globalStyle
      this.width = this.msg.pxWidth(`${size}px SimHei`)
      const totallyMove = Controller.boxWidth + this.width + 80
      this.duration = totallyMove / speed
      this.el.attr("style", `--size:${size}px;--color:${color};--opacity:${opacity};--top:${this.top}px;--duration:${this.duration}s;--translate:${-totallyMove}px`)
    }
  }

  class Controller {
    static boxWidth = 0
    static boxHeight = 0
    constructor() {
      this.$box = $('<div class="chen-dm-box"></div>')
      this.readyToSend = []
      this.maxDelay = 5000
      this.danmakuUsingTop = []
      this.featureMap = new Map() // key: "feature", value: dm
      this.styleToUpdate = []
      this.mount()
      this.openHandleCircle(300)
      this.openDanmakuKiller(500)
      this.dev()
    }

    mount() {
      this.$box.prependTo('#live-player')
      $('#chat-items').on('DOMNodeInserted', (e) => {
        const msg = e.target.dataset.danmaku
        if (msg) this.handleNewMsg(msg)
      })
      console.log('box mounted')

      new ResizeObserver(entries => {
        entries.forEach(entry => {
          Controller.boxWidth = entry.contentRect.width
          Controller.boxHeight = entry.contentRect.height
          for (let dm of this.featureMap.values()) {
            dm.generateRollStyle(Controller.boxWidth)
          }
        })
      }).observe(this.$box[0])
    }

    handleNewMsg(msg) {
      const dm = new Danmaku(msg)
      if (this.mergeWhenRepeat(dm)) return
      this.readyToSend.push(dm)
    }

    mergeWhenRepeat(dm) {
      const target = this.featureMap.get(dm.feature)
      if (target) {
        // fixme 有改进空间
        if (target.duration * 1000 + target.sendedTime < Date.now()) {
          dm.el.remove()
          this.featureMap.delete(dm.feature)
          return false
        }
        target.repeatCount++
        this.styleToUpdate.push(target)
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

    openHandleCircle(time) {
      setInterval(() => {
        this.removeOvertimeMsgs()
        const tops = this.getFreeTops(this.readyToSend.length)
        const $fragment = $(document.createDocumentFragment())
        for (let top of tops) {
          const dm = this.readyToSend.shift()
          if (!dm) break
          if (this.mergeWhenRepeat(dm)) continue
          dm.mount($fragment, top)
          this.featureMap.set(dm.feature, dm)
          this.danmakuUsingTop.push({
            lower: top - 1,
            upper: top - 1 + Danmaku.lineHeight,
            timeStamp: Date.now() + (dm.width + 30) / Danmaku.globalStyle.speed * 1000
          })
        }
        $fragment.appendTo(this.$box)

        for (let dm of this.styleToUpdate) {
          dm.el.text(`${dm.msg}₍${this.turnNumberToSubscript(dm.repeatCount)}₎`)
          dm.updateStyleAfterMerge()
        }
        this.styleToUpdate = []
        if (tops.length > 0) this.danmakuUsingTop.sort((a, b) => a.lower - b.lower)
      }, time)
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
          if (top + height > Controller.boxHeight) {
            return result
          }
          result.push(top + 1)
          top += height
        }
      }
      while (result.length < num) {
        if (top + height > Controller.boxHeight) {
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

    openDanmakuKiller(time) {
      setInterval(() => {
        for (let dm of this.featureMap.values()) {
          if (dm.sendedTime + dm.duration * 1000 < Date.now()) {
            dm.el.remove()
            this.featureMap.delete(dm.feature)
          }
        }
      }, time)
    }

    dev() {
      // setInterval(() => {
      //   this.handleNewMsg('合并')
      // }, 50)
      // setInterval(() => {
      //   this.handleNewMsg('【赢】')
      // }, 500)
      // setInterval(() => {
      //   this.handleNewMsg('测试')
      // }, 20)
      // setInterval(() => {
      //   handleDanmaku('嘉然？')
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
