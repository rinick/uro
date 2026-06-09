import {addMove, createNewGame, updateGameInfo} from '@ulugo/sgf-core';
import {describe, expect, it} from 'vitest';
import {buildKataGoQuery, normalizeKomi, normalizeRules} from '.';

describe('katago-core', () => {
  it('uses Japanese rules and 6.5 komi when game info is missing', () => {
    const document = updateGameInfo(createNewGame(), {KM: '', RU: ''});
    const query = buildKataGoQuery(document, {id: 'test', path: []});

    expect(query.komi).toBe(6.5);
    expect(query.rules).toBe('japanese');
  });

  it('normalizes komi to KataGo-compatible half-integers', () => {
    expect(normalizeKomi('7,5')).toBe(7.5);
    expect(normalizeKomi('7.25')).toBe(7.5);
    expect(normalizeKomi('375')).toBe(7.5);
    expect(normalizeKomi('')).toBe(6.5);
    expect(normalizeKomi(Number.NaN)).toBe(6.5);
  });

  it('normalizes supported rule names', () => {
    expect(normalizeRules('Japanese')).toBe('japanese');
    expect(normalizeRules('New Zealand')).toBe('new-zealand');
    expect(normalizeRules('')).toBe('japanese');
  });

  it('targets the current turn by default', () => {
    const first = addMove(createNewGame(), [], 'B', 'dd');
    const second = addMove(first.document, first.path, 'W', 'pp');
    const query = buildKataGoQuery(second.document, {id: 'test', path: second.path});

    expect(query.analyzeTurns).toEqual([2]);
  });
});
