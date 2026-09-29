/* 英文单词发音练习 · 词库
 *
 * 纯数据，挂到 window.WORD_BANK。想加词只需往这里追加主题/词条，app.js 的逻辑不用动。
 *
 * 字段说明：
 *   word     英文单词（会送去朗读，也是口型动画的时长依据）
 *   phonetic 音标，两侧带 / 。**必须只用 app.js 里 PHONEMES 收录的符号**，
 *            因为口型动画就是靠切分它得到的；写错符号不会崩，但会退化成中性口型。
 *   meaning  中文释义
 *   emoji    配图（用 emoji 代替图片，零资源、零请求）
 *   sentence 例句，短、简单，能被朗读出来
 *
 * 选词参考人教版 PEP 小学英语三、四年级，并刻意覆盖了各个难音：
 *   th（three / mouth / father）、f-v（five / fifteen / beef）、
 *   w（water / white / window）、r（red / ruler / library）、
 *   l（lion / light / leg）、长短元音对比（sheep-short i / food / foot）。
 */
window.WORD_BANK = {

  /* ============================ 三年级上 · 文具 ============================ */
  '三年级上 · 文具': [
    { word: 'pen',       phonetic: '/pen/',          meaning: '钢笔',   emoji: '🖊️', sentence: 'This is my pen.' },
    { word: 'pencil',    phonetic: '/ˈpensl/',       meaning: '铅笔',   emoji: '✏️', sentence: 'I have a pencil.' },
    { word: 'ruler',     phonetic: '/ˈruːlər/',      meaning: '尺子',   emoji: '📏', sentence: 'Can I use your ruler?' },
    { word: 'eraser',    phonetic: '/ɪˈreɪsər/',     meaning: '橡皮',   emoji: '🧽', sentence: 'I need an eraser.' },
    { word: 'book',      phonetic: '/bʊk/',          meaning: '书',     emoji: '📕', sentence: 'Open your book, please.' },
    { word: 'bag',       phonetic: '/bæɡ/',          meaning: '书包',   emoji: '🎒', sentence: 'My bag is very heavy.' },
    { word: 'crayon',    phonetic: '/ˈkreɪən/',      meaning: '蜡笔',   emoji: '🖍️', sentence: 'I have a new crayon.' },
    { word: 'sharpener', phonetic: '/ˈʃɑːrpənər/',   meaning: '卷笔刀', emoji: '🔪', sentence: 'Where is my sharpener?' },
    { word: 'notebook',  phonetic: '/ˈnoʊtbʊk/',     meaning: '笔记本', emoji: '📓', sentence: 'This is my notebook.' },
    { word: 'paper',     phonetic: '/ˈpeɪpər/',      meaning: '纸',     emoji: '📄', sentence: 'I need some paper.' },
    { word: 'glue',      phonetic: '/ɡluː/',         meaning: '胶水',   emoji: '🧴', sentence: 'Here is the glue.' },
    { word: 'scissors',  phonetic: '/ˈsɪzərz/',      meaning: '剪刀',   emoji: '✂️', sentence: 'These are my scissors.' },
    { word: 'marker',    phonetic: '/ˈmɑːrkər/',     meaning: '记号笔', emoji: '🖊️', sentence: 'This is a red marker.' },
    { word: 'picture',   phonetic: '/ˈpɪktʃər/',     meaning: '图画',   emoji: '🖼️', sentence: 'I like this picture.' },
    { word: 'name',      phonetic: '/neɪm/',         meaning: '名字',   emoji: '🏷️', sentence: 'My name is Amy.' },
    { word: 'school',    phonetic: '/skuːl/',        meaning: '学校',   emoji: '🏫', sentence: 'I go to school every day.' }
  ],

  /* ============================ 三年级上 · 颜色 ============================ */
  '三年级上 · 颜色': [
    { word: 'red',     phonetic: '/red/',          meaning: '红色', emoji: '🔴', sentence: 'The apple is red.' },
    { word: 'blue',    phonetic: '/bluː/',         meaning: '蓝色', emoji: '🔵', sentence: 'The sky is blue.' },
    { word: 'green',   phonetic: '/ɡriːn/',        meaning: '绿色', emoji: '🟢', sentence: 'The tree is green.' },
    { word: 'yellow',  phonetic: '/ˈjeloʊ/',       meaning: '黄色', emoji: '🟡', sentence: 'I have a yellow hat.' },
    { word: 'orange',  phonetic: '/ˈɔːrɪndʒ/',     meaning: '橙色', emoji: '🟠', sentence: 'This ball is orange.' },
    { word: 'purple',  phonetic: '/ˈpɜːrpl/',      meaning: '紫色', emoji: '🟣', sentence: 'I like the purple one.' },
    { word: 'pink',    phonetic: '/pɪŋk/',         meaning: '粉色', emoji: '🩷', sentence: 'Her dress is pink.' },
    { word: 'black',   phonetic: '/blæk/',         meaning: '黑色', emoji: '⚫', sentence: 'The cat is black.' },
    { word: 'white',   phonetic: '/waɪt/',         meaning: '白色', emoji: '⚪', sentence: 'I have a white shirt.' },
    { word: 'brown',   phonetic: '/braʊn/',        meaning: '棕色', emoji: '🟤', sentence: 'The bear is brown.' },
    { word: 'gray',    phonetic: '/ɡreɪ/',         meaning: '灰色', emoji: '🩶', sentence: 'The cloud is gray.' },
    { word: 'gold',    phonetic: '/ɡoʊld/',        meaning: '金色', emoji: '🥇', sentence: 'She has a gold star.' },
    { word: 'color',   phonetic: '/ˈkʌlər/',       meaning: '颜色', emoji: '🎨', sentence: 'What color is it?' },
    { word: 'rainbow', phonetic: '/ˈreɪnboʊ/',     meaning: '彩虹', emoji: '🌈', sentence: 'Look at the rainbow!' }
  ],

  /* ============================ 三年级上 · 动物 ============================ */
  '三年级上 · 动物': [
    { word: 'cat',      phonetic: '/kæt/',        meaning: '猫',     emoji: '🐱', sentence: 'The cat is sleeping.' },
    { word: 'dog',      phonetic: '/dɔːɡ/',       meaning: '狗',     emoji: '🐶', sentence: 'My dog can run fast.' },
    { word: 'bird',     phonetic: '/bɜːrd/',      meaning: '鸟',     emoji: '🐦', sentence: 'A bird is in the tree.' },
    { word: 'fish',     phonetic: '/fɪʃ/',        meaning: '鱼',     emoji: '🐟', sentence: 'The fish is in the water.' },
    { word: 'duck',     phonetic: '/dʌk/',        meaning: '鸭子',   emoji: '🦆', sentence: 'The duck can swim.' },
    { word: 'pig',      phonetic: '/pɪɡ/',        meaning: '猪',     emoji: '🐷', sentence: 'The pig is very fat.' },
    { word: 'monkey',   phonetic: '/ˈmʌŋki/',     meaning: '猴子',   emoji: '🐵', sentence: 'The monkey is funny.' },
    { word: 'tiger',    phonetic: '/ˈtaɪɡər/',    meaning: '老虎',   emoji: '🐯', sentence: 'The tiger is strong.' },
    { word: 'lion',     phonetic: '/ˈlaɪən/',     meaning: '狮子',   emoji: '🦁', sentence: 'The lion is the king.' },
    { word: 'panda',    phonetic: '/ˈpændə/',     meaning: '熊猫',   emoji: '🐼', sentence: 'I love the panda.' },
    { word: 'elephant', phonetic: '/ˈelɪfənt/',   meaning: '大象',   emoji: '🐘', sentence: 'The elephant is very big.' },
    { word: 'rabbit',   phonetic: '/ˈræbɪt/',     meaning: '兔子',   emoji: '🐰', sentence: 'The rabbit likes carrots.' },
    { word: 'horse',    phonetic: '/hɔːrs/',      meaning: '马',     emoji: '🐴', sentence: 'The horse can run.' },
    { word: 'cow',      phonetic: '/kaʊ/',        meaning: '奶牛',   emoji: '🐮', sentence: 'The cow is on the farm.' },
    { word: 'sheep',    phonetic: '/ʃiːp/',       meaning: '绵羊',   emoji: '🐑', sentence: 'The sheep is white.' },
    { word: 'bear',     phonetic: '/ber/',        meaning: '熊',     emoji: '🐻', sentence: 'The bear is brown.' },
    { word: 'mouse',    phonetic: '/maʊs/',       meaning: '老鼠',   emoji: '🐭', sentence: 'The mouse is very small.' },
    { word: 'zebra',    phonetic: '/ˈziːbrə/',    meaning: '斑马',   emoji: '🦓', sentence: 'The zebra has stripes.' }
  ],

  /* ============================ 三年级下 · 数字 ============================ */
  '三年级下 · 数字': [
    { word: 'one',      phonetic: '/wʌn/',              meaning: '一',   emoji: '1️⃣', sentence: 'I have one apple.' },
    { word: 'two',      phonetic: '/tuː/',              meaning: '二',   emoji: '2️⃣', sentence: 'I have two hands.' },
    { word: 'three',    phonetic: '/θriː/',             meaning: '三',   emoji: '3️⃣', sentence: 'I see three birds.' },
    { word: 'four',     phonetic: '/fɔːr/',             meaning: '四',   emoji: '4️⃣', sentence: 'A table has four legs.' },
    { word: 'five',     phonetic: '/faɪv/',             meaning: '五',   emoji: '5️⃣', sentence: 'I have five fingers.' },
    { word: 'six',      phonetic: '/sɪks/',             meaning: '六',   emoji: '6️⃣', sentence: 'There are six eggs.' },
    { word: 'seven',    phonetic: '/ˈsevn/',            meaning: '七',   emoji: '7️⃣', sentence: 'A week has seven days.' },
    { word: 'eight',    phonetic: '/eɪt/',              meaning: '八',   emoji: '8️⃣', sentence: 'I am eight years old.' },
    { word: 'nine',     phonetic: '/naɪn/',             meaning: '九',   emoji: '9️⃣', sentence: 'Nine and one is ten.' },
    { word: 'ten',      phonetic: '/ten/',              meaning: '十',   emoji: '🔟', sentence: 'I have ten fingers.' },
    { word: 'eleven',   phonetic: '/ɪˈlevn/',           meaning: '十一', emoji: '1️⃣1️⃣', sentence: 'There are eleven boys.' },
    { word: 'twelve',   phonetic: '/twelv/',            meaning: '十二', emoji: '1️⃣2️⃣', sentence: 'A year has twelve months.' },
    { word: 'thirteen', phonetic: '/ˌθɜːrˈtiːn/',       meaning: '十三', emoji: '1️⃣3️⃣', sentence: 'She is thirteen.' },
    { word: 'fourteen', phonetic: '/ˌfɔːrˈtiːn/',       meaning: '十四', emoji: '1️⃣4️⃣', sentence: 'Fourteen and one is fifteen.' },
    { word: 'fifteen',  phonetic: '/ˌfɪfˈtiːn/',        meaning: '十五', emoji: '1️⃣5️⃣', sentence: 'I have fifteen pencils.' },
    { word: 'sixteen',  phonetic: '/ˌsɪksˈtiːn/',       meaning: '十六', emoji: '1️⃣6️⃣', sentence: 'Sixteen is a big number.' },
    { word: 'seventeen',phonetic: '/ˌsevnˈtiːn/',       meaning: '十七', emoji: '1️⃣7️⃣', sentence: 'My brother is seventeen.' },
    { word: 'eighteen', phonetic: '/ˌeɪˈtiːn/',         meaning: '十八', emoji: '1️⃣8️⃣', sentence: 'There are eighteen desks.' },
    { word: 'nineteen', phonetic: '/ˌnaɪnˈtiːn/',       meaning: '十九', emoji: '1️⃣9️⃣', sentence: 'Nineteen comes after eighteen.' },
    { word: 'twenty',   phonetic: '/ˈtwenti/',          meaning: '二十', emoji: '2️⃣0️⃣', sentence: 'I can count to twenty.' }
  ],

  /* ============================ 三年级下 · 身体 ============================ */
  '三年级下 · 身体': [
    { word: 'head',   phonetic: '/hed/',         meaning: '头',   emoji: '🙂', sentence: 'Touch your head.' },
    { word: 'hair',   phonetic: '/her/',         meaning: '头发', emoji: '💇', sentence: 'Her hair is long.' },
    { word: 'eye',    phonetic: '/aɪ/',          meaning: '眼睛', emoji: '👁️', sentence: 'I have two eyes.' },
    { word: 'ear',    phonetic: '/ɪr/',          meaning: '耳朵', emoji: '👂', sentence: 'Touch your ear.' },
    { word: 'nose',   phonetic: '/noʊz/',        meaning: '鼻子', emoji: '👃', sentence: 'My nose is small.' },
    { word: 'mouth',  phonetic: '/maʊθ/',        meaning: '嘴',   emoji: '👄', sentence: 'Close your mouth.' },
    { word: 'tooth',  phonetic: '/tuːθ/',        meaning: '牙齿', emoji: '🦷', sentence: 'My tooth is white.' },
    { word: 'face',   phonetic: '/feɪs/',        meaning: '脸',   emoji: '😊', sentence: 'Wash your face.' },
    { word: 'hand',   phonetic: '/hænd/',        meaning: '手',   emoji: '✋', sentence: 'Give me your hand.' },
    { word: 'arm',    phonetic: '/ɑːrm/',        meaning: '手臂', emoji: '💪', sentence: 'My arm is strong.' },
    { word: 'leg',    phonetic: '/leɡ/',         meaning: '腿',   emoji: '🦵', sentence: 'My legs are long.' },
    { word: 'foot',   phonetic: '/fʊt/',         meaning: '脚',   emoji: '🦶', sentence: 'My foot hurts.' },
    { word: 'knee',   phonetic: '/niː/',         meaning: '膝盖', emoji: '🦿', sentence: 'Bend your knee.' },
    { word: 'finger', phonetic: '/ˈfɪŋɡər/',     meaning: '手指', emoji: '👆', sentence: 'I have ten fingers.' },
    { word: 'toe',    phonetic: '/toʊ/',         meaning: '脚趾', emoji: '🦶', sentence: 'Touch your toes.' },
    { word: 'body',   phonetic: '/ˈbɑːdi/',      meaning: '身体', emoji: '🧍', sentence: 'My body is strong.' }
  ],

  /* ============================ 四年级上 · 食物 ============================ */
  '四年级上 · 食物': [
    { word: 'apple',     phonetic: '/ˈæpl/',           meaning: '苹果',   emoji: '🍎', sentence: 'I eat an apple every day.' },
    { word: 'banana',    phonetic: '/bəˈnænə/',        meaning: '香蕉',   emoji: '🍌', sentence: 'The banana is yellow.' },
    { word: 'pear',      phonetic: '/per/',            meaning: '梨',     emoji: '🍐', sentence: 'This pear is sweet.' },
    { word: 'bread',     phonetic: '/bred/',           meaning: '面包',   emoji: '🍞', sentence: 'I have bread for breakfast.' },
    { word: 'cake',      phonetic: '/keɪk/',           meaning: '蛋糕',   emoji: '🍰', sentence: 'The cake is very nice.' },
    { word: 'egg',       phonetic: '/eɡ/',             meaning: '鸡蛋',   emoji: '🥚', sentence: 'I eat one egg a day.' },
    { word: 'milk',      phonetic: '/mɪlk/',           meaning: '牛奶',   emoji: '🥛', sentence: 'I drink milk in the morning.' },
    { word: 'water',     phonetic: '/ˈwɔːtər/',        meaning: '水',     emoji: '💧', sentence: 'Drink more water.' },
    { word: 'rice',      phonetic: '/raɪs/',           meaning: '米饭',   emoji: '🍚', sentence: 'I eat rice for lunch.' },
    { word: 'noodles',   phonetic: '/ˈnuːdlz/',        meaning: '面条',   emoji: '🍜', sentence: 'The noodles are hot.' },
    { word: 'chicken',   phonetic: '/ˈtʃɪkɪn/',        meaning: '鸡肉',   emoji: '🍗', sentence: 'I like chicken.' },
    { word: 'beef',      phonetic: '/biːf/',           meaning: '牛肉',   emoji: '🥩', sentence: 'The beef is very good.' },
    { word: 'soup',      phonetic: '/suːp/',           meaning: '汤',     emoji: '🍲', sentence: 'The soup is warm.' },
    { word: 'juice',     phonetic: '/dʒuːs/',          meaning: '果汁',   emoji: '🧃', sentence: 'Can I have some juice?' },
    { word: 'tea',       phonetic: '/tiː/',            meaning: '茶',     emoji: '🍵', sentence: 'My father likes tea.' },
    { word: 'ice cream', phonetic: '/ˈaɪs kriːm/',     meaning: '冰淇淋', emoji: '🍦', sentence: 'I want an ice cream.' },
    { word: 'hamburger', phonetic: '/ˈhæmbɜːrɡər/',    meaning: '汉堡',   emoji: '🍔', sentence: 'He eats a hamburger.' },
    { word: 'salad',     phonetic: '/ˈsæləd/',         meaning: '沙拉',   emoji: '🥗', sentence: 'The salad is fresh.' }
  ],

  /* ============================ 四年级上 · 家庭 ============================ */
  '四年级上 · 家庭': [
    { word: 'father',  phonetic: '/ˈfɑːðər/',    meaning: '爸爸',   emoji: '👨', sentence: 'My father is a doctor.' },
    { word: 'mother',  phonetic: '/ˈmʌðər/',     meaning: '妈妈',   emoji: '👩', sentence: 'My mother likes music.' },
    { word: 'brother', phonetic: '/ˈbrʌðər/',    meaning: '兄弟',   emoji: '👦', sentence: 'My brother is ten.' },
    { word: 'sister',  phonetic: '/ˈsɪstər/',    meaning: '姐妹',   emoji: '👧', sentence: 'My sister can sing.' },
    { word: 'grandpa', phonetic: '/ˈɡrænpɑː/',   meaning: '爷爷',   emoji: '👴', sentence: 'My grandpa tells stories.' },
    { word: 'grandma', phonetic: '/ˈɡrænmɑː/',   meaning: '奶奶',   emoji: '👵', sentence: 'My grandma makes good food.' },
    { word: 'uncle',   phonetic: '/ˈʌŋkl/',      meaning: '叔叔',   emoji: '🧔', sentence: 'My uncle is very tall.' },
    { word: 'aunt',    phonetic: '/ænt/',        meaning: '阿姨',   emoji: '👩‍🦰', sentence: 'My aunt lives in Beijing.' },
    { word: 'cousin',  phonetic: '/ˈkʌzn/',      meaning: '堂表兄妹', emoji: '🧑', sentence: 'My cousin is my friend.' },
    { word: 'baby',    phonetic: '/ˈbeɪbi/',     meaning: '宝宝',   emoji: '👶', sentence: 'The baby is sleeping.' },
    { word: 'family',  phonetic: '/ˈfæməli/',    meaning: '家庭',   emoji: '👨‍👩‍👧', sentence: 'I love my family.' },
    { word: 'son',     phonetic: '/sʌn/',        meaning: '儿子',   emoji: '👦', sentence: 'He is their son.' },
    { word: 'daughter',phonetic: '/ˈdɔːtər/',    meaning: '女儿',   emoji: '👧', sentence: 'She is my daughter.' },
    { word: 'friend',  phonetic: '/frend/',      meaning: '朋友',   emoji: '🤝', sentence: 'You are my best friend.' },
    { word: 'home',    phonetic: '/hoʊm/',       meaning: '家',     emoji: '🏠', sentence: 'I am at home now.' },
    { word: 'parent',  phonetic: '/ˈperənt/',    meaning: '父母',   emoji: '👪', sentence: 'My parents love me.' }
  ],

  /* ============================ 四年级上 · 教室 ============================ */
  '四年级上 · 教室': [
    { word: 'teacher',    phonetic: '/ˈtiːtʃər/',      meaning: '老师',   emoji: '👩‍🏫', sentence: 'Our teacher is very kind.' },
    { word: 'student',    phonetic: '/ˈstuːdnt/',      meaning: '学生',   emoji: '🧑‍🎓', sentence: 'I am a student.' },
    { word: 'classroom',  phonetic: '/ˈklæsruːm/',     meaning: '教室',   emoji: '🏫', sentence: 'Our classroom is big.' },
    { word: 'desk',       phonetic: '/desk/',          meaning: '课桌',   emoji: '🪑', sentence: 'The book is on the desk.' },
    { word: 'chair',      phonetic: '/tʃer/',          meaning: '椅子',   emoji: '💺', sentence: 'Sit on the chair.' },
    { word: 'door',       phonetic: '/dɔːr/',          meaning: '门',     emoji: '🚪', sentence: 'Please close the door.' },
    { word: 'window',     phonetic: '/ˈwɪndoʊ/',       meaning: '窗户',   emoji: '🪟', sentence: 'Open the window, please.' },
    { word: 'blackboard', phonetic: '/ˈblækbɔːrd/',    meaning: '黑板',   emoji: '📋', sentence: 'Look at the blackboard.' },
    { word: 'light',      phonetic: '/laɪt/',          meaning: '灯',     emoji: '💡', sentence: 'Turn on the light.' },
    { word: 'map',        phonetic: '/mæp/',           meaning: '地图',   emoji: '🗺️', sentence: 'The map is on the wall.' },
    { word: 'computer',   phonetic: '/kəmˈpjuːtər/',   meaning: '电脑',   emoji: '💻', sentence: 'We have a new computer.' },
    { word: 'fan',        phonetic: '/fæn/',           meaning: '电扇',   emoji: '🌀', sentence: 'The fan is on.' },
    { word: 'wall',       phonetic: '/wɔːl/',          meaning: '墙',     emoji: '🧱', sentence: 'The wall is white.' },
    { word: 'floor',      phonetic: '/flɔːr/',         meaning: '地板',   emoji: '🧹', sentence: 'The floor is clean.' },
    { word: 'clock',      phonetic: '/klɑːk/',         meaning: '钟',     emoji: '🕐', sentence: 'The clock is on the wall.' },
    { word: 'playground', phonetic: '/ˈpleɪɡraʊnd/',   meaning: '操场',   emoji: '🛝', sentence: 'We play on the playground.' },
    { word: 'library',    phonetic: '/ˈlaɪbreri/',     meaning: '图书馆', emoji: '📚', sentence: 'The library is quiet.' }
  ]

};
