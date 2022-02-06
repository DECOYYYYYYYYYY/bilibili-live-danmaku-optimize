(function () {
  console.log('弹幕优化插件启动')
  const $box = $('<div class="chen-dm-box"></div>')
  //todo 合并弹幕
  const liveDanmakus = new Map() // key: featureCode ,value: {element: $div, originalMsg: msg, repeatCount: 1}
  const danmakuStyleInfo = {'size': '27px', 'color': '#fff', 'opacity': '0.4'}
  const danmakuUsingTop = []
  let speed = 100

  function handleDanmaku(msg) {
    let feature = getFeatureString(msg)
    const item = liveDanmakus.get(feature)
    if (item) {
      item.repeatCount++
      item.element.text(`${item.originalMsg}₍${turnNumberToSubscript(item.repeatCount)}₎`)
      setDanmakuStyleAfterMerge(item)
      liveDanmakus.set(feature, item)
      saveMergeHistory()
    } else {
      sendDanmaku(msg, feature)
    }

    function getFeatureString(msg) {
      msg = exchangeCharsFromZhToEn(msg)
      msg = trimPunctuation(msg)
      msg = handleRepeatString(msg)
      return msg

      // "？？！。。" => "??!.."
      function exchangeCharsFromZhToEn(s) {
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

      function trimPunctuation(s) {
        let punctuation = ["?", "!", "."]
        let i = 0
        let j = s.length - 1
        while(i < s.length && punctuation.indexOf(s[i]) !== -1) {
          i++
        }
        while(j >= 0 && punctuation.indexOf(s[j]) !== -1) {
          j--
        }
        return i <= j ? s.slice(i, j+1) : s
      }

      // "abcdefg" => "abcdefg"
      // "dogdogdog" => "dog"
      function handleRepeatString(s) {
        let i = (s + s).slice(1, -1).indexOf(s)
        return i === -1 ? s : s.slice(0, i + 1)
      }
    }

    function turnNumberToSubscript(num) {
      let arr = []
      while (num > 0) {
        arr.unshift(String.fromCharCode(8320 + num % 10))
        num = Math.floor(num / 10)
      }
      return arr.join('')
    }

    function saveMergeHistory(){
      chrome.storage.local.get(['mergeHistory'], (result) => {
        let value = result.mergeHistory
        // let value = undefined
        if (!value) {
          value = []
        }
        let info = `已合并：${msg}  ==>  ${item.originalMsg}`
        if (value.indexOf(info) === -1) {
          value.push(info)
        }
        chrome.storage.local.set({'mergeHistory': value}, () => {
        })
      })
    }

    // function saveMergeHistory() {
    //   let value = [18, 29]
    //   chrome.storage.local.set({key: value}, function() {
    //     // console.log('Value is set to ' + value);
    //   });
    //
    //   chrome.storage.local.get(['key'], function(result) {
    //     value = result.key
    //   });
    //   value.push(33)
    //   chrome.storage.local.set({key: value}, function() {
    //     // console.log('Value is set to ' + value);
    //   });
    //
    //   chrome.storage.local.get(['key'], function(result) {
    //     console.log('Value currently is ' + result.key.length);
    //   });
    // }

    function sendDanmaku(msg, feature) {
      let $div = $(`<div class="chen-danmaku">${msg}</div>`)
      liveDanmakus.set(feature, {element: $div, originalMsg: msg, repeatCount: 1, addedClass: []})
      $div.appendTo($box)
      let top = 0
      let InsertIndex = 0
      $div.attr("style", `--size:${danmakuStyleInfo.size};`)
      let height = $div.height()
      let duration = ($box.width() + $div.width()) / speed

      for (let i = 0; i < danmakuUsingTop.length; i++) {
        if (top <= danmakuUsingTop[i] && danmakuUsingTop[i] < top + height) {
          top += height
          InsertIndex = i + 1
        } else if (top + height <= danmakuUsingTop[i]) {
          break
        }
      }
      danmakuUsingTop.splice(InsertIndex, 0, top)
      setTimeout(() => {
        danmakuUsingTop.splice(danmakuUsingTop.indexOf(top), 1)
      }, ($div.width() + 30) / speed * 1000)
      setTimeout(() => {
        liveDanmakus.delete(feature)
        $div.remove()
      }, duration * 1000)

      // 可选
      // --weight: bold;
      // --shadowColor: #000000;
      $div.attr("style", `--size:${danmakuStyleInfo.size};--color:${danmakuStyleInfo.color};--opacity:${danmakuStyleInfo.opacity};--top:${top}px;--duration:${duration}s;`)
    }

    function setDanmakuStyleAfterMerge(item) {
      let styleMap = new Map([
        [3, 'chen-danmaku-merge-3'],
        [8, 'chen-danmaku-merge-8'],
        [15, 'chen-danmaku-merge-15'],
        [30, 'chen-danmaku-merge-30'],
      ])
      const result = styleMap.get(item.repeatCount)
      if (result) {
        const addedClass = item.addedClass
        if (addedClass) item.element.removeClass(addedClass)
        item.element.addClass(result)
        item.addedClass = result
      }
    }
  }

  function mount() {
    $box.prependTo('#live-player')
    $('#chat-items').on('DOMNodeInserted', (e) => {
      let msg = e.target.dataset.danmaku
      if (msg) handleDanmaku(msg)
    })

    // test
    setInterval(() => {
      handleDanmaku('？嘉然')
      // console.log(liveDanmakus)
    }, 1000)
    setInterval(() => {
      handleDanmaku('赢')
      // console.log(liveDanmakus)
    }, 500)
    setInterval(() => {
      handleDanmaku('赢！！！')
      // console.log(liveDanmakus)
    }, 400)
    setInterval(() => {
      handleDanmaku('嘉然？')
      // console.log(liveDanmakus)
    }, 700)
  }

  async function getMergeHistory(){
    return await new Promise((resolve) => {
      chrome.storage.local.get(['mergeHistory'], (result) => {
        resolve(result.mergeHistory)
      })
    })
  }

  let intervalID = setInterval(() => {
    console.log('check')
    if (document.getElementById('live-player')) {
      mount()
      clearInterval(intervalID)
      console.log('mounted')
    }
  }, 1000)
})()
