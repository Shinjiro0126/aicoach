import {
  applyPaceToMain,
  effectivePace,
  LIGHTER_SUFFIX,
  WIDER_SUFFIX,
  type PaceDeclaration,
} from '../pace';

const TITLE = '英単語を10個おぼえる';

describe('effectivePace(宣言のスコープ)', () => {
  const declaration: PaceDeclaration = { pace: 'lighter', forWeekNo: 3 };

  it('対象週(forWeekNo)だけに効く', () => {
    expect(effectivePace(declaration, 3)).toBe('lighter');
  });

  it('対象週の前後には漏れない(前週・翌週とも keep)', () => {
    expect(effectivePace(declaration, 2)).toBe('keep');
    expect(effectivePace(declaration, 4)).toBe('keep');
  });

  it('宣言が無ければ keep', () => {
    expect(effectivePace(null, 3)).toBe('keep');
    expect(effectivePace(undefined, 3)).toBe('keep');
  });
});

describe('applyPaceToMain(main文言への反映)', () => {
  it('keep は無変更', () => {
    expect(applyPaceToMain(TITLE, 'keep')).toBe(TITLE);
  });

  it('lighter は「5分版で十分」の接尾を足す(元の行動文は壊さない)', () => {
    expect(applyPaceToMain(TITLE, 'lighter')).toBe(`${TITLE}${LIGHTER_SUFFIX}`);
  });

  it('wider は「もう5分足す」の接尾を足す(元の行動文は壊さない)', () => {
    expect(applyPaceToMain(TITLE, 'wider')).toBe(`${TITLE}${WIDER_SUFFIX}`);
  });

  it('接尾が既に付いた文言に再適用しても重複付与しない', () => {
    const once = applyPaceToMain(TITLE, 'lighter');
    expect(applyPaceToMain(once, 'lighter')).toBe(once);
  });

  it('別の歩幅を適用すると接尾が置き換わる(併記されない)', () => {
    const lighter = applyPaceToMain(TITLE, 'lighter');
    expect(applyPaceToMain(lighter, 'wider')).toBe(`${TITLE}${WIDER_SUFFIX}`);
  });

  it('前週の接尾が daily_actions 経由で残っていても keep で剥がれる(他週に漏れない)', () => {
    const stale = `${TITLE}${WIDER_SUFFIX}`;
    expect(applyPaceToMain(stale, 'keep')).toBe(TITLE);
  });
});
