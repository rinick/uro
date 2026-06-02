import {describe, expect, it} from 'vitest';
import {addLabel, addMarkup, addMove, createNewGame, parseSgf, serializeSgf, updateComment} from '.';

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
});
