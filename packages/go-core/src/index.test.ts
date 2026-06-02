import {describe, expect, it} from 'vitest';
import {addLabel, addMarkup, addMove, createNewGame} from '@uro/sgf-core';
import {deriveBoardPosition} from '.';

describe('go-core', () => {
  it('derives stones from moves', () => {
    const first = addMove(createNewGame(), [], 'B', 'dd');
    const second = addMove(first.document, first.path, 'W', 'pp');

    const position = deriveBoardPosition(second.document, second.path);

    expect(position.stones.get('dd')).toBe('B');
    expect(position.stones.get('pp')).toBe('W');
    expect(position.moveNumber).toBe(2);
  });

  it('derives labels and markup from the current node', () => {
    const first = addMove(createNewGame(), [], 'B', 'dd');
    let document = addMarkup(first.document, first.path, 'CR', 'dd');
    document = addLabel(document, first.path, 'pp', 'A');

    const point = deriveBoardPosition(document, first.path).points.find((item) => item.point === 'pp');
    expect(point?.label).toBe('A');
  });

  it('captures surrounded stones', () => {
    let result = addMove(createNewGame(), [], 'B', 'bc');
    result = addMove(result.document, result.path, 'W', 'cc');
    result = addMove(result.document, result.path, 'B', 'cb');
    result = addMove(result.document, result.path, 'W', 'qq');
    result = addMove(result.document, result.path, 'B', 'dc');
    result = addMove(result.document, result.path, 'W', 'rr');
    result = addMove(result.document, result.path, 'B', 'cd');

    const position = deriveBoardPosition(result.document, result.path);
    expect(position.stones.has('cc')).toBe(false);
    expect(position.captures.B).toBe(1);
  });
});
