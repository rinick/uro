import {describe, expect, it} from 'vitest';
import {
  addLabel,
  addMarkup,
  addMove,
  countMoves,
  createNewGame,
  deleteNode,
  formatPoint,
  moveBranch,
  moveBranchToMain,
  parseSgf,
  replaceMove,
  serializeSgf,
  updateComment,
} from '.';

describe('sgf-core', () => {
  it('creates a 19x19 SGF by default', () => {
    const sgf = serializeSgf(createNewGame());
    expect(sgf).toContain('GM[1]FF[4]CA[UTF-8]SZ[19]');
    expect(sgf).toMatch(/DT\[\d{4}-\d{2}-\d{2}\]/);
    expect(sgf).toContain('GN[Game ');
  });

  it('creates explicit board sizes', () => {
    expect(serializeSgf(createNewGame(13))).toContain('SZ[13]');
    expect(serializeSgf(createNewGame(9))).toContain('SZ[9]');
  });

  it('parses and serializes variations', () => {
    const document = parseSgf('(;GM[1]SZ[19];B[dd](;W[pp])(;W[dp]))');
    expect(document.root.children[0].children).toHaveLength(2);
    expect(serializeSgf(document)).toBe('(;GM[1]SZ[19];B[dd](;W[pp])(;W[dp]))');
  });

  it('escapes comments', () => {
    const document = updateComment(createNewGame(), [], 'one ] two \\ three');
    expect(serializeSgf(document)).toContain('C[one \\] two \\\\ three]');
  });

  it('adds moves, labels, and markup', () => {
    let result = addMove(createNewGame(), [], 'B', 'dd');
    let document = addMarkup(result.document, result.path, 'TR', 'pq');
    document = addLabel(document, result.path, 'dp', '1');

    expect(serializeSgf(document)).toContain(';B[dd]TR[pq]LB[dp:1])');
  });

  it('formats display coordinates without I', () => {
    expect(formatPoint('aa')).toBe('A19');
    expect(formatPoint('hh')).toBe('H12');
    expect(formatPoint('ii')).toBe('J11');
    expect(formatPoint('ss')).toBe('T1');
    expect(formatPoint('ii', 13)).toBe('J5');
  });

  it('counts moves across variations', () => {
    expect(countMoves(parseSgf('(;GM[1]SZ[19];B[dd](;W[pp])(;W[dp];B[pq]))'))).toBe(4);
  });

  it('reorders branches', () => {
    const document = parseSgf('(;GM[1]SZ[19];B[aa](;W[bb])(;W[cc]))');
    const movedLeft = moveBranch(document, [0, 1], -1);
    expect(movedLeft.path).toEqual([0, 0]);
    expect(serializeSgf(movedLeft.document)).toBe('(;GM[1]SZ[19];B[aa](;W[cc])(;W[bb]))');

    const main = moveBranchToMain(document, [0, 1]);
    expect(main.path).toEqual([0, 0]);
    expect(serializeSgf(main.document)).toBe('(;GM[1]SZ[19];B[aa](;W[cc])(;W[bb]))');
  });

  it('replaces a move and merges matching branches', () => {
    const document = parseSgf('(;GM[1]SZ[19];B[aa](;W[bb];B[dd])(;W[cc];B[ee]))');
    const result = replaceMove(document, [0, 1], 'bb');
    expect(result.path).toEqual([0, 0]);
    expect(serializeSgf(result.document)).toBe('(;GM[1]SZ[19];B[aa];W[bb](;B[dd])(;B[ee]))');
  });

  it('deletes a node and its children', () => {
    const document = parseSgf('(;GM[1]SZ[19];B[aa](;W[bb];B[dd])(;W[cc]))');
    const result = deleteNode(document, [0, 0]);
    expect(result.path).toEqual([0]);
    expect(serializeSgf(result.document)).toBe('(;GM[1]SZ[19];B[aa];W[cc])');
  });
});
