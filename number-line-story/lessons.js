/* A fresh, visual-first lesson. Each card introduces just one new idea. */
window.NUMBER_LINE_LESSONS = [
  {
    title: '先看懂题', subtitle: '把线段想成两把尺', tag: '准备 · 看懂它怎么动',
    steps: [
      { title: '把它们想成两把小尺子', from: 0, to: 0,
        body: '<p><strong class="orange-text">橙色短尺 PQ，长 2。</strong><br><strong class="blue-text">蓝色长尺 MN，长 4。</strong></p><p>尺子可以移动，但不会变长，也不会翻面。</p><p class="takeaway">先记住：P 一直在 Q 左边，M 一直在 N 左边。</p>' },
      { title: '先找到四个端点', from: 0, to: 0,
        body: '<p>Q 在 A，也就是 −20。P 比 Q 向左 2 格。</p><div class="formula">P：−20 − 2 ＝ −22</div><p>N 在 B，也就是 −8。M 比 N 向左 4 格。</p><div class="formula">M：−8 − 4 ＝ −12</div>',
        check: { question: '向左走，要加还是减？', options: ['减', '加'], correct: 0, yes: '对，数轴上往左，表示的数变小。', no: '看看数轴：−22 在 −20 左边，所以向左要减。' } },
      { title: '过了 2 秒，谁走得更远？', from: 0, to: 2,
        body: '<p>两把尺子<strong>同时出发，都向右</strong>。</p><div class="formula">短尺：3 × 2 ＝ 6 格<br>长尺：1 × 2 ＝ 2 格</div><p>看：短尺走得快，正在追赶长尺。</p><p class="takeaway">同一把尺子的两个端点，移动的距离一样。</p>' },
      { title: 'Q 到 C，要走多少秒？', from: 0, to: 12,
        body: '<p>从 −20 走到 16，一共走：</p><div class="formula">16 − (−20) ＝ 36 格<br>36 ÷ 3 ＝ 12 秒</div><p><strong>第 12 秒，Q 到 C，短尺立刻掉头。</strong>蓝色长尺继续向右。</p><p class="takeaway">只有行进方向改变，P、Q 的左右顺序不变。</p>' },
      { title: '原路返回，还要 12 秒', from: 12, to: 24,
        body: '<p>回来仍走 36 格，速度仍是每秒 3 格，所以还要 12 秒。</p><div class="formula">全部时间：12 ＋ 12 ＝ 24 秒</div><p>Q 回到 A，两把尺子同时停止。</p><p class="takeaway">前两问先记：0～12 秒去，12～24 秒回。第（3）问另加减速规则，稍后重新计时。</p>',
        check: { question: '短尺往左返回时，P 在 Q 的哪边？', options: ['仍在左边', '变到右边'], correct: 0, yes: '对！尺子平移，没有翻面，始终 P＝Q−2。', no: '尺子没有翻面。往左移动时，P 仍然在 Q 左边 2 格。' } }
    ]
  },
  {
    title: '第 ① 问', subtitle: '20 秒时在哪里', tag: '第（1）问 · 拆开 20 秒',
    steps: [
      { title: '20 秒，已经在回来的路上', from: 12, to: 20,
        body: '<p>前 12 秒，Q 已经走到 C。还剩：</p><div class="formula">20 − 12 ＝ 8 秒</div><p>这 8 秒是<strong>从 C 向左走</strong>，不能一直按向右计算。</p><p class="takeaway">先判断“去”还是“回”，再算位置。</p>' },
      { title: '从 C 往左，算 Q 的位置', from: 12, to: 20,
        body: '<p>回来走了 8 秒，也就是向左走了 3 × 8＝24 格。</p><div class="formula">Q：16 − 24 ＝ −8</div><p>请看图：此时 Q 正好回到 B。</p>',
        check: { question: '从 16 向左走 24 格，结果是多少？', options: ['−8', '8', '40'], correct: 0, yes: '对，先走到 0，再向左走 8 格，就是 −8。', no: '向左是减：16−24＝−8。可以先走 16 格到 0，再走 8 格。' } },
      { title: 'M 一直向右，直接算', from: 0, to: 20,
        body: '<p>M 从 −12 出发，以每秒 1 格一直向右走了 20 秒。</p><div class="formula">M：−12 ＋ 1 × 20 ＝ 8</div><p>所以按题目填空的顺序：</p><div class="formula">M 是 8，Q 是 −8。<small>“走了多远”和“现在表示什么数”是两件事。</small></div>' }
    ]
  },
  {
    title: '第 ② 问', subtitle: '两段距离一样长', tag: '第（2）问 · 比较 CQ 和 PM',
    steps: [
      { title: 'CQ＝PM，说的是距离相等', from: 0, to: 12, distances: true,
        body: '<p><strong>CQ</strong>：Q 离终点 C 还有多远。<br><strong>PM</strong>：P 和 M 之间隔了多远。</p><p>看左边两条长度条。<strong>一样长的时候，就是我们要找的时刻。</strong></p><p class="takeaway">距离总是大于或等于 0。相减时，要用右边的数减左边的数。</p>' },
      { title: '先走到 P 追上 M 的时刻', from: 0, to: 5, distances: true,
        body: '<p>最初 P 在 −22，M 在 −12，相距 10 格。</p><p>P 每秒比 M 多走 3−1＝2 格。</p><div class="formula">追上要：10 ÷ 2 ＝ 5 秒</div><p>第 5 秒，P 和 M 重合，PM＝0。此时 Q＝−5，离 C 还有 <strong>21 格</strong>。</p>' },
      { title: '去程：一段变短，一段变长', from: 5, to: 9.2, distances: true,
        body: '<p>从第 5 秒起，P 走到了 M 的右边。</p><p>CQ 每秒<strong>缩短 3 格</strong>；PM 每秒<strong>增加 2 格</strong>。两条长度条的差，每秒减少 5 格。</p><div class="formula">还要：21 ÷ (3＋2) ＝ 4.2 秒<br>t ＝ 5 ＋ 4.2 ＝ 9.2 秒</div><p>这时 M＝−12＋9.2＝<strong>−2.8</strong>。</p>' },
      { title: '返程：从第 12 秒重新看', from: 12, to: 12, distances: true,
        body: '<p>第 12 秒，Q 在 16，P 在 14，M 在 0。</p><div class="formula">CQ ＝ 0，PM ＝ 14</div><p>接下来 Q 向左，CQ 每秒<strong>增加 3 格</strong>。</p><p>P 向左、M 向右，迎面靠近，PM 每秒<strong>缩短 3＋1＝4 格</strong>。</p>' },
      { title: '返程：再过 2 秒，一样长', from: 12, to: 14, distances: true,
        body: '<p>两条长度条原来差 14 格，现在每秒缩小 3＋4＝7 格。</p><div class="formula">还要：14 ÷ 7 ＝ 2 秒<br>t ＝ 12 ＋ 2 ＝ 14 秒</div><p>这时 CQ＝PM＝6，M 表示：</p><div class="formula">−12 ＋ 14 ＝ 2</div>' },
      { title: '最开始，会不会还漏了一次？', from: 0, to: 5, distances: true,
        body: '<p>看最开始的 0～5 秒：</p><p>CQ 从 36 变到 21，<strong>一直不小于 21</strong>。</p><p>PM 从 10 变到 0，<strong>一直不大于 10</strong>。</p><div class="formula">CQ 始终比 PM 长，不会相等。</div>' },
      { title: 'P 返回到 M 左边后呢？', from: 15.5, to: 24, distances: true,
        body: '<p>从第 12 秒起，再过 14÷4＝3.5 秒，P 与 M 相遇。此时 t＝15.5，<strong>CQ＝10.5、PM＝0</strong>。</p><p>之后 CQ 每秒长 3 格，PM 每秒长 4 格。PM 想追平，需要 10.5÷(4−3)＝<strong>10.5 秒</strong>。</p><div class="formula">实际还剩：24 − 15.5 ＝ 8.5 秒<br>时间不够，不会再相等。</div><p class="takeaway">看到停止时，两条长度条还是差 2 格。</p>' },
      { title: '第（2）问：一共两种情况', from: 14, to: 14, distances: true,
        body: '<p>去程一次，返程一次。开始和最后两段也已经检查过。</p><div class="formula">去程 t＝9.2，M＝−2.8<br>返程 t＝14，M＝2</div><p>题目问的是 <strong>M 表示的数</strong>，所以答案是：</p><div class="formula">−2.8 或 2<small>用分数写，就是 −14/5 或 2。</small></div>' }
    ]
  },
  {
    title: '第 ③ 问', subtitle: '重合时，两把尺子都减速', tag: '第（3）问 · 重新从 0 秒出发', slowed: true,
    steps: [
      { title: '这一问，重新从 0 秒开始', from: 0, to: 0, zoom: true,
        body: '<p>加入新规则：<strong>有重合部分时，两把尺子都减速。</strong>重合消失，才恢复原速。</p><div class="formula">短尺：3 → 1.5 格/秒<br>长尺：1 → 0.5 格/秒</div><p class="takeaway">前两问的“12 秒掉头、24 秒结束”不能直接套用。下面重新累计实际时间。</p>' },
      { title: '第一次碰到：第 4 秒', from: 0, to: 4, zoom: true,
        body: '<p>开始时，Q 在 −20，M 在 −12，中间空着 8 格。</p><p>还没重合，速度还是 3 和 1。每秒追近 2 格。</p><div class="formula">8 ÷ (3−1) ＝ 4 秒</div><p><strong>第 4 秒，Q 碰到 M。</strong>再往前，就开始重合、开始减速。</p>' },
      { title: '先看完整的一次“穿过去”', from: 4, to: 10, zoom: true,
        body: '<p>请看放大图，绿色才是重合部分。</p><p><strong>① 慢慢变长：0 → 2<br>② 短尺全在长尺里：保持 2<br>③ 慢慢变短：2 → 0</strong></p><p class="takeaway">所以重合长 1.5 会出现两次：进入时一次，离开前一次。中间不会继续长到 4。</p>',
        check: { question: '重合部分最长能有多长？', options: ['2', '4', '6'], correct: 0, yes: '对，短尺只有 2 格，重合部分不可能比短尺更长。', no: '看橙色短尺：它只有 2 格。整条都重合，也只能是 2。' } },
      { title: '第一个 1.5：进入的时候', from: 4, to: 5.5, zoom: true,
        body: '<p>重合后，短尺每秒走 1.5 格，长尺每秒走 0.5 格。</p><p>所以每秒多进去 <strong>1.5−0.5＝1 格</strong>，绿色部分每秒长 1 格。</p><div class="formula">从 0 长到 1.5，要 1.5 秒<br>t₁ ＝ 4 ＋ 1.5 ＝ 5.5 秒</div><p class="takeaway">1.5 秒是“重合以后又走的时间”，还要加前面的 4 秒。</p>' },
      { title: '完全穿过去，是第几秒？', from: 4, to: 10, zoom: true,
        body: '<p>从 Q 刚碰到 M，到 P 刚离开 N，要让<strong>两把尺子的长度都穿过去</strong>：2＋4＝6 格。</p><p>减速后，每秒相对移动 1 格，因此要 6 秒。</p><div class="formula">第一次重合结束：4 ＋ 6 ＝ 10 秒</div><p class="takeaway">这 6 秒包含“变长、完全重合、变短”三个阶段。</p>' },
      { title: '第二个 1.5：离开之前', from: 10, to: 8.5, zoom: true, reverse: true,
        body: '<p>现在把动画<strong>倒回去看</strong>。第 10 秒，重合刚刚消失，长度是 0。</p><p>最后这段，每秒缩短 1 格。要从 1.5 缩到 0，还需 1.5 秒。</p><div class="formula">t₂ ＝ 10 − 1.5 ＝ 8.5 秒</div><p>所以离开之前，第 8.5 秒也会重合 1.5。</p>' },
      { title: '先恢复原速，再走到 C', from: 10, to: 15, zoom: true,
        body: '<p>第 10 秒重合结束时，Q 已走到 1。</p><p>从 1 到 C 的 16，还剩 15 格。恢复每秒 3 格，需 5 秒。</p><div class="formula">到 C 的时刻：10 ＋ 5 ＝ 15 秒</div><p>此时 Q＝16、P＝14，M＝0、N＝4。<strong>第 15 秒，短尺掉头。</strong></p>' },
      { title: '返程，什么时候再次碰到？', from: 15, to: 17.5, zoom: true,
        body: '<p>现在 P 在 14，N 在 4，相隔 10 格。</p><p>P 向左、N 向右，迎面靠近；还没重合，速度是 3 和 1。</p><div class="formula">再走：10 ÷ (3＋1) ＝ 2.5 秒<br>再次接触：15 ＋ 2.5 ＝ 17.5 秒</div><p>第 17.5 秒，P 碰到 N，接下来两把尺子再次减速。</p>' },
      { title: '迎面穿过：这次每秒近 2 格', from: 17.5, to: 20.5, zoom: true,
        body: '<p>重合后，短尺向左每秒 1.5 格，长尺向右每秒 0.5 格。</p><p><strong>方向相反，要相加：</strong>每秒相对移动 2 格。</p><div class="formula">穿过需：(2＋4) ÷ 2 ＝ 3 秒<br>重合结束：17.5 ＋ 3 ＝ 20.5 秒</div><p>仍然经历“0 → 2 → 保持 2 → 0”。</p>' },
      { title: '第三个 1.5：再次进入时', from: 17.5, to: 18.25, zoom: true,
        body: '<p>这次绿色部分每秒增加 2 格。</p><div class="formula">增加到 1.5：1.5 ÷ 2 ＝ 0.75 秒<br>t₃ ＝ 17.5 ＋ 0.75 ＝ 18.25 秒</div><p class="takeaway">同向追赶用速度差；迎面靠近用速度和。先看箭头，再选加减。</p>' },
      { title: '第四个 1.5：再次离开前', from: 20.5, to: 19.75, zoom: true, reverse: true,
        body: '<p>再从重合消失的第 20.5 秒<strong>往前倒推</strong>。</p><p>每秒缩短 2 格，最后的 1.5 格需要 0.75 秒。</p><div class="formula">t₄ ＝ 20.5 − 0.75 ＝ 19.75 秒</div><p>至此，两次穿过，各找到两个时刻。</p>' },
      { title: '四个时刻，你已经找齐了', from: 19.75, to: 19.75, zoom: true,
        body: '<p>按实际发生的先后顺序：</p><div class="formula">5.5，8.5，18.25，19.75 秒</div><p>分数写法：</p><div class="formula">11/2，17/2，73/4，79/4 秒</div><p>点击下方四张时间卡片，看绿色部分是不是都长 <strong>1.5</strong>。</p><p class="takeaway">两次穿过 × 每次两个 1.5 ＝ 四个答案。</p>' },
      { title: '最后再检查：还会重合吗？', from: 20.5, to: 28.5, zoom: true,
        body: '<p>第 20.5 秒之后，短尺向左、长尺向右，<strong>越走越远</strong>，不会再次重合。</p><p>这时 Q＝4，回到 A 的 −20 还需 (4＋20)÷3＝8 秒。</p><div class="formula">28.5 秒，Q 回到 A，全部停止。</div><p>这也检查了：四个答案都在实际运动时间内，没有遗漏。</p>' }
    ]
  }
];
