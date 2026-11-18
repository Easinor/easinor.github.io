// 两只布偶猫的配色
window.DOLL = window.DOLL || {};
(function (D) {
  'use strict';

  D.CATS = {
    // 海双布偶：白底 + 海豹色（深褐灰）点，脸上倒 V 白斑，四只白手套
    luna: {
      id: 'luna',
      name: 'Luna',
      breed: 'Seal Bicolor Ragdoll',
      desc: 'A white inverted V on her face and four white socks. Quiet, loves watching the window.',
      coat: { light: '#FDF8F2', mid: '#EDE0D2', deep: '#D8C5B2' },
      point: { light: '#8D7A73', base: '#6A564F', dark: '#483833' },
      cape: 0.62,          // 背上海豹色「披风」的浓度
      bicolor: true,       // 倒 V 白脸 + 白手套
      nose: '#7A5F59',
      earIn: '#C9A3A0',
      eye: { iris: '#2E6CC9', inner: '#79B6F2', rim: '#1C3F7A' },
      tagColor: '#7E8BB8',
      favorite: 'dried fish'
    },
    // 火焰色布偶：奶油底 + 杏橘色点，粉鼻子
    nova: {
      id: 'nova',
      name: 'Nova',
      breed: 'Flame Point Ragdoll',
      desc: 'Apricot-orange ears and tail, with a pink nose. Rowdy, goes wild for the wand.',
      coat: { light: '#FFFAF1', mid: '#F8EAD6', deep: '#EFD6B6' },
      point: { light: '#F2AC72', base: '#E0894A', dark: '#BC652C' },
      cape: 0.30,
      bicolor: false,      // 全脸杏色面罩
      nose: '#E99B95',
      earIn: '#F0B8AE',
      eye: { iris: '#3B8DDF', inner: '#A6DCF7', rim: '#27588F' },
      tagColor: '#DE9A5E',
      favorite: 'freeze-dried chicken'
    }
  };

  D.CAT_LIST = ['luna', 'nova'];
})(window.DOLL);
