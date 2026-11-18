// 猫的像素精灵（高分辨率版）。
// 结构：一张精细的脸 head_f（41x36）+ 各姿势的身体，身体上有 head 锚点。
// 两只猫共用图形只换调色板：M = 脸中央（Luna 是白倒 V，Nova 是浅杏色），
// P = 点色（耳朵/面罩/尾巴），W 亮毛，w/d 暗毛，i 耳内粉，o 描边。
window.DOLL = window.DOLL || {};
(function (D) {
  'use strict';
  const PX = D.PX;
  const S = {};
  const mk = (id, art, meta) => { const sp = PX.sprite(art, meta); sp.id = id; S[id] = sp; return sp; };

  // ======================= 脸 =======================
  mk('head_f', [
    '.......oo....................oo........',
    '......oPPo..................oPPo.......',
    '.....oPPPPo................oPPPPo......',
    '....oPPiPPo................oPPiPPo.....',
    '....oPPiiPPo..............oPPiiPPo.....',
    '...oPPiiiiPPo............oPPiiiiPPo....',
    '...oPPiiiiiPPo..........oPPiiiiiPPo....',
    '..oPPPiiiiiPPPo........oPPPiiiiiPPPo...',
    '..oPPPiiiiiPPPo........oPPPiiiiiPPPo...',
    '..oPPPPiiiPPPPo........oPPPPiiiPPPPo...',
    '..oPPPPPiPPPPPoooooooooPPPPPiPPPPPo....',
    '...oPPPPPPPPPPPPPPMMMPPPPPPPPPPPPPPo...',
    '..oPPPPPPPPPPPPPPMMMMMPPPPPPPPPPPPPPo..',
    '.oPPPPPPPPPPPPPPMMMMMMMPPPPPPPPPPPPPPo.',
    'oPPPPPPPPPPPPPPMMMMMMMMMPPPPPPPPPPPPPPo',
    'oPPPP...oooo...MMMMMMMMM...oooo...PPPPo',
    'oPPPP..oEEEEo..MMMMMMMMM..oEEEEo..PPPPo',
    'oPPPP.oeekkEEo.MMMMMMMMM.oeekkEEo.PPPPo',
    'oPPPPEEeekkEEEEMMMMMMMMMEEeekkEEEEPPPPo',
    'oPPPPEEEEkkEEEEMMMMMMMMMEEEEkkEEEEPPPPo',
    'oPPPPEEEEkkEEEEMMMMMMMMMEEEEkkEEEEPPPPo',
    'oPPPP.EEEkkEEE.MMMMMMMMM.EEEkkEEE.PPPPo',
    'oPPPP..EEEEEE..MMMMMMMMM..EEEEEE..PPPPo',
    'oPPPP...EEEE...MMMMMMMMM...EEEE...PPPPo',
    'oPPPPPPPPPPWWWWWWWWWWWWWWWWWPPPPPPPPPPo',
    '.oPPPPPPPPWWWWWWWWWWWWWWWWWWWPPPPPPPPo.',
    '..oPPPPPPPWWWWWWWWnnnWWWWWWWWPPPPPPPo..',
    '...oPPPPPPWWdWWdWWWnWWWdWWdWWPPPPPPo...',
    '....oPPPPPWWWWWWoWWoWWoWWWWWWPPPPPo....',
    '......oPPPWWWWWWWWWWWWWWWWWWWPPPo......',
    '........oPWWWWWWWWWWWWWWWWWWWPo........',
    '............oWWWWWWWWWWWWWo............',
    '................ooooooo................'
  ], {
    ax: 19, ay: 32, eyes: [5, 15],
    // 胡子：嘴边那几个 d 是胡子根（27 行的 12/15 和 23/26），
    // 线太细不能进精灵图（还会被 39 宽的脸切掉），所以存成
    // [根x, 根y, 梢x, 梢y, 拱] 每帧现画，见 cat-draw.js 的 drawWhiskers。
    // 梢要比根低（下垂），中间再往上拱一点，才是猫胡子那条弧；
    // 拉成直线就是几根天线。上下别张太开：外端抬到眼睛那一行
    // 就会从眼球上划过去。中间一根最长，上下两根短一截。
    whisk: [[12, 25, -8, 24, 3], [12, 27, -11, 29, 3.5], [13, 29, -8, 33, 2.5],
      [26, 25, 46, 24, 3], [26, 27, 49, 29, 3.5], [25, 29, 46, 33, 2.5]]
  });

  // 四分之三侧脸：轮廓和正脸同一张，只把五官整体滑向嘴筒那侧。
  // 近侧眼原尺寸，远侧眼挤成 7 宽靠到前脸边，远侧耳收窄往后转。
  // 别自己重画轮廓，一歪就是「畸形」。
  mk('head_q', [
    '.......oo......................oo......',
    '......oPPo....................oPPo.....',
    '.....oPPPPo..................oPPPo.....',
    '....oPPiPPo..................oPiPo.....',
    '....oPPiiPPo................oPiiPo.....',
    '...oPPiiiiPPo...............oPiiPo.....',
    '...oPPiiiiiPPo.............oPiiiPo.....',
    '..oPPPiiiiiPPPo............oPPiiiPo....',
    '..oPPPiiiiiPPPo............oPPiiiPo....',
    '..oPPPPiiiPPPPo............oPPiiPPo....',
    '..oPPPPPiPPPPPoooooooooooooPPPiPPPo....',
    '...oPPPPPPPPPPPPPPPPPPMMMPPPPPPPPPPo...',
    '..oPPPPPPPPPPPPPPPPPPMMMMMPPPPPPPPPPo..',
    '.oPPPPPPPPPPPPPPPPPPMMMMMMMPPPPPPPPPPo.',
    'oPPPPPPPPPPPPPPPPPPMMMMMMMMMPPPPPPPPPPo',
    'oPPPPPPPPPPPooooPPPMMMMMMMMMPPPPPPPPPPo',
    'oPPPPPPPPPPoEEEEoPPMMMMMMMMMPooooPPPPPo',
    'oPPPPPPPPPoeekkEEoPMMMMMMMMMoEEEEoPPPPo',
    'oPPPPPPPPEEeekkEEEEMMMMMMMMMeekkEEoPPPo',
    'oPPPPPPPPEEEEkkEEEEMMMMMMMMMeekkEEEPPo.',
    'oPPPPPPPPEEEEkkEEEEMMMMMMMMMEEkkEEEPPo.',
    'oPPPPPPPPPEEEkkEEEPMMMMMMMMMEEkkEEEPo..',
    'oPPPPPPPPPPEEEEEEPPMMMMMMMMMEEEEEEPPo..',
    '.oPPPPPPPPPPEEEEPPPMMMMMMMMMPEEEEPPo...',
    '.oPPPPPPPPPPPPPPWWWWWWWWWWWWWWWPPPPo...',
    '..oPPPPPPPPPPPPWWWWWWWWWWWWWWWWWPPPo...',
    '...oPPPPPPPPPPPWWWWWWWnnnWWWWWWWPPPo...',
    '....oPPPPPPPPPPWWdWdWWWnWWWdWdWWPPo....',
    '......oPPPPPPPWWWWWoWWoWWoWWWWWPPo.....',
    '........oPPPPPWWWWWWWWWWWWWWWWWPo......',
    '...........oPWWWWWWWWWWWWWWWWWo........',
    '...............oWWWWWWWWWWWo...........',
    '..................ooooooo..............'
  ], {
    ax: 19, ay: 32, eyes: [9, 15],
    // 四分之三：嘴筒滑向前脸那侧，胡子根在 27 行的 17/19 和 27/29。
    // 远侧（画面左）的胡子是透视压缩的，要画短，不然会糊到身子上。
    whisk: [[28, 25, 48, 24, 3], [28, 27, 51, 29, 3.5], [27, 29, 48, 33, 2.5],
      [18, 25, 4, 24, 2], [18, 27, 1, 29, 2.5], [19, 29, 5, 32, 2]]
  });

  // ---------- 四分之三用的双眼覆盖层（10 + 9 空 + 7）----------
  mk('eye2_shut', [
    'PPPPPPPPPP................',
    'PPPPPPPPPP.........PPPPPPP',
    'PPPPPPPPPP.........PPPPPPP',
    'PPooooooPP.........PPPPPPP',
    'PoPPPPPPoP.........ooooooP',
    'PPPPPPPPPP.........PPPPPPo',
    'PPPPPPPPPP.........PPPPPPP',
    'PPPPPPPPPP.........PPPPPPP',
    'PPPPPPPPPP.........PPPPPPP'
  ], { ax: 0, ay: 0 });

  mk('eye2_happy', [
    'PPPPPPPPPP................',
    'PPPPPPPPPP.........PPPPPPP',
    'PPPPooPPPP.........PPPPPPP',
    'PPPoPPoPPP.........PPooPPP',
    'PPoPPPPoPP.........PoPPoPP',
    'PoPPPPPPoP.........oPPPPoP',
    'PPPPPPPPPP.........PPPPPPP',
    'PPPPPPPPPP.........PPPPPPP',
    'PPPPPPPPPP.........PPPPPPP'
  ], { ax: 0, ay: 0 });

  mk('eye2_half', [
    'PPPPPPPPPP................',
    'PPPPPPPPPP.........PPPPPPP',
    'PPPPPPPPPP.........PPPPPPP',
    'PPooooooPP.........PPPPPPP',
    'EEEEkkEEEE.........ooooooP',
    'EEEEkkEEEE.........EEkkEEE',
    '.EEEkkEEE..........EEkkEEE',
    '..EEEEEE...........EEEEEE.',
    '...EEEE.............EEEE..'
  ], { ax: 0, ay: 0 });

  mk('eye2_big', [
    '...oooo...................',
    '..oEEEEo............oooo..',
    '.oEkkkkEo..........oEEEEo.',
    'EEkkkkkkEE.........EkkkkEo',
    'EEkkkkkkEE.........kkkkkkE',
    'EEkkkkkkEE.........kkkkkkE',
    '.EkkkkkkE..........kkkkkkE',
    '..EEEEEE...........EEEEEE.',
    '...EEEE.............EEEE..'
  ], { ax: 0, ay: 0 });

  mk('eye2_up', [
    '...oooo...................',
    '..oEEEEo............oooo..',
    '.oeekkEEo..........oEEEEo.',
    'EEeekkEEEE.........eekkEEo',
    'EEEEkkEEEE.........eekkEEE',
    'EEEEEEEEEE.........EEkkEEE',
    '.EEEEEEEE..........EEEEEEE',
    '..EEEEEE...........EEEEEE.',
    '...EEEE.............EEEE..'
  ], { ax: 0, ay: 0 });

  // ---------- 眼睛覆盖层（29 宽 9 高，中间留空）----------
  mk('eye_shut', [
    'PPPPPPPPPP.........PPPPPPPPPP',
    'PPPPPPPPPP.........PPPPPPPPPP',
    'PPPPPPPPPP.........PPPPPPPPPP',
    'PPooooooPP.........PPooooooPP',
    'PoPPPPPPoP.........PoPPPPPPoP',
    'PPPPPPPPPP.........PPPPPPPPPP',
    'PPPPPPPPPP.........PPPPPPPPPP',
    'PPPPPPPPPP.........PPPPPPPPPP',
    'PPPPPPPPPP.........PPPPPPPPPP'
  ], { ax: 0, ay: 0 });

  mk('eye_happy', [
    'PPPPPPPPPP.........PPPPPPPPPP',
    'PPPPPPPPPP.........PPPPPPPPPP',
    'PPPPooPPPP.........PPPPooPPPP',
    'PPPoPPoPPP.........PPPoPPoPPP',
    'PPoPPPPoPP.........PPoPPPPoPP',
    'PoPPPPPPoP.........PoPPPPPPoP',
    'PPPPPPPPPP.........PPPPPPPPPP',
    'PPPPPPPPPP.........PPPPPPPPPP',
    'PPPPPPPPPP.........PPPPPPPPPP'
  ], { ax: 0, ay: 0 });

  mk('eye_half', [
    'PPPPPPPPPP.........PPPPPPPPPP',
    'PPPPPPPPPP.........PPPPPPPPPP',
    'PPPPPPPPPP.........PPPPPPPPPP',
    'PPooooooPP.........PPooooooPP',
    'EEEEkkEEEE.........EEEEkkEEEE',
    'EEEEkkEEEE.........EEEEkkEEEE',
    '.EEEkkEEE...........EEEkkEEE.',
    '..EEEEEE.............EEEEEE..',
    '...EEEE...............EEEE...'
  ], { ax: 0, ay: 0 });

  mk('eye_big', [
    '...oooo...............oooo...',
    '..oEEEEo.............oEEEEo..',
    '.oEkkkkEo...........oEkkkkEo.',
    'EEkkkkkkEE.........EEkkkkkkEE',
    'EEkkkkkkEE.........EEkkkkkkEE',
    'EEkkkkkkEE.........EEkkkkkkEE',
    '.EkkkkkkE...........EkkkkkkE.',
    '..EEEEEE.............EEEEEE..',
    '...EEEE...............EEEE...'
  ], { ax: 0, ay: 0 });

  mk('eye_up', [
    '...oooo...............oooo...',
    '..oEEEEo.............oEEEEo..',
    '.oeekkEEo...........oeekkEEo.',
    'EEeekkEEEE.........EEeekkEEEE',
    'EEEEkkEEEE.........EEEEkkEEEE',
    'EEEEEEEEEE.........EEEEEEEEEE',
    '.EEEEEEEE...........EEEEEEEE.',
    '..EEEEEE.............EEEEEE..',
    '...EEEE...............EEEE...'
  ], { ax: 0, ay: 0 });

  D.CAT_SPR = S;
})(window.DOLL);
