import { mockPlan } from '../ai/mock';
import {
  currentMilestoneIndex,
  isCurrentMilestone,
  milestonePhase,
  milestoneRangeLabel,
  type MilestoneRange,
} from '../milestones';

const phase = (fromWeek: number, toWeek: number, title = 'テスト'): MilestoneRange => ({
  fromWeek,
  toWeek,
  title,
});

describe('isCurrentMilestone', () => {
  const m = phase(3, 6);

  it('fromWeek ちょうどの週は現在フェーズに入る', () => {
    expect(isCurrentMilestone(m, 3)).toBe(true);
  });

  it('toWeek ちょうどの週は現在フェーズに入る', () => {
    expect(isCurrentMilestone(m, 6)).toBe(true);
  });

  it('範囲の手前・後ろの週は入らない', () => {
    expect(isCurrentMilestone(m, 2)).toBe(false);
    expect(isCurrentMilestone(m, 7)).toBe(false);
  });

  it('1週だけのフェーズ(fromWeek === toWeek)も判定できる', () => {
    expect(isCurrentMilestone(phase(4, 4), 4)).toBe(true);
    expect(isCurrentMilestone(phase(4, 4), 5)).toBe(false);
  });
});

describe('milestonePhase', () => {
  const m = phase(3, 6);

  it('toWeek を過ぎた週は done', () => {
    expect(milestonePhase(m, 7)).toBe('done');
  });

  it('fromWeek より前の週は upcoming', () => {
    expect(milestonePhase(m, 2)).toBe('upcoming');
  });

  it('境界(fromWeek / toWeek)は current', () => {
    expect(milestonePhase(m, 3)).toBe('current');
    expect(milestonePhase(m, 6)).toBe('current');
  });
});

describe('currentMilestoneIndex', () => {
  const list = [phase(1, 4), phase(5, 8), phase(9, 13)];

  it('現在の週が入るフェーズのindexを返す', () => {
    expect(currentMilestoneIndex(list, 1)).toBe(0);
    expect(currentMilestoneIndex(list, 5)).toBe(1);
    expect(currentMilestoneIndex(list, 13)).toBe(2);
  });

  it('どのフェーズにも入らない週は -1', () => {
    expect(currentMilestoneIndex(list, 14)).toBe(-1);
  });

  it('milestones が空なら -1', () => {
    expect(currentMilestoneIndex([], 1)).toBe(-1);
  });
});

describe('milestoneRangeLabel', () => {
  it('複数週のフェーズは「第x〜y週」', () => {
    expect(milestoneRangeLabel(phase(1, 4))).toBe('第1〜4週');
  });

  it('1週だけのフェーズは「第x週」', () => {
    expect(milestoneRangeLabel(phase(5, 5))).toBe('第5週');
  });
});

describe('mockPlan の milestones', () => {
  /** フェーズが第1週〜最終週を隙間なく・重複なく分割していることを検証する */
  function expectContinuous(milestones: MilestoneRange[], totalWeeks: number) {
    expect(milestones[0].fromWeek).toBe(1);
    expect(milestones[milestones.length - 1].toWeek).toBe(totalWeeks);
    for (let i = 1; i < milestones.length; i++) {
      expect(milestones[i].fromWeek).toBe(milestones[i - 1].toWeek + 1);
    }
  }

  it('型に合う milestones を返す(13週=3フェーズで全期間をカバー)', () => {
    const plan = mockPlan({ goalTitle: 'テスト', why: '', durationWeeks: 13, startDate: '2026-08-29' });
    const milestones = plan.milestones ?? [];
    expect(milestones.length).toBe(3);
    for (const m of milestones) {
      expect(typeof m.fromWeek).toBe('number');
      expect(typeof m.toWeek).toBe('number');
      expect(m.toWeek).toBeGreaterThanOrEqual(m.fromWeek);
      expect(typeof m.title).toBe('string');
      expect(m.title.length).toBeGreaterThan(0);
      expect(m.title.length).toBeLessThanOrEqual(15);
    }
    expectContinuous(milestones, 13);
  });

  it('短い期間(4週)は2フェーズで全期間をカバーする', () => {
    const plan = mockPlan({ goalTitle: 'テスト', why: '', durationWeeks: 4, startDate: '2026-08-29' });
    const milestones = plan.milestones ?? [];
    expect(milestones.length).toBe(2);
    expectContinuous(milestones, 4);
  });

  it('最短の2週でも壊れない(1週ずつの2フェーズ)', () => {
    const plan = mockPlan({ goalTitle: 'テスト', why: '', durationWeeks: 2, startDate: '2026-08-29' });
    const milestones = plan.milestones ?? [];
    expect(milestones.length).toBe(2);
    expectContinuous(milestones, 2);
  });

  it('長い期間(52週)でも連続・重複なしで分割する', () => {
    const plan = mockPlan({ goalTitle: 'テスト', why: '', durationWeeks: 52, startDate: '2026-08-29' });
    expectContinuous(plan.milestones ?? [], 52);
  });
});
