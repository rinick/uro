import {createElement as h, Component} from 'react';
import type {CSSProperties, HTMLAttributes, Ref} from 'react';
import classnames from 'classnames';

import {
  random,
  readjustShifts,
  neighborhood,
  vertexEquals,
  vertexEvents,
  diffSignMap,
  range,
  getHoshis,
  type Vertex as VertexPoint,
  type VertexEventName,
} from './helper';
import {CoordX, CoordY} from './Coord';
import Grid from './Grid';
import Vertex, {type GhostStone, type HeatVertex, type MoveHint, type VertexHandler} from './Vertex';
import Line, {type LineMarker} from './Line';
import type {Marker} from './Marker';

export type Vertex = VertexPoint;
export type Map<T> = T[][];
export type {GhostStone, HeatVertex, LineMarker, Marker, MoveHint};

type Sign = 0 | -1 | 1;

type PublicVertexEventHandlers = Partial<Record<`onVertex${VertexEventName}`, VertexHandler>>;

type InnerProps = HTMLAttributes<HTMLElement> & {
  ref?: Ref<HTMLElement>;
};

export interface GobanProps extends PublicVertexEventHandlers {
  id?: string;
  class?: string;
  className?: string;
  style?: CSSProperties;
  innerProps?: InnerProps;
  busy?: boolean;
  vertexSize?: number;
  rangeX?: [start: number, stop: number];
  rangeY?: [start: number, stop: number];
  showCoordinates?: boolean;
  coordX?: (x: number) => string | number;
  coordY?: (y: number) => string | number;
  fuzzyStonePlacement?: boolean;
  animateStonePlacement?: boolean;
  animationDuration?: number;
  signMap?: Map<Sign>;
  markerMap?: Map<Marker | null>;
  paintMap?: Map<number>;
  ghostStoneMap?: Map<GhostStone | null>;
  heatMap?: Map<HeatVertex | null>;
  moveHintMap?: Map<MoveHint | null>;
  selectedVertices?: VertexPoint[];
  dimmedVertices?: VertexPoint[];
  lines?: LineMarker[];
}

interface GobanState {
  signMap: Map<Sign>;
  width: number;
  height: number;
  rangeX: [number, number];
  rangeY: [number, number];
  animatedVertices: VertexPoint[];
  clearAnimatedVerticesHandler: ReturnType<typeof setTimeout> | null;
  xs: number[];
  ys: number[];
  hoshis: VertexPoint[];
  shiftMap: number[][];
  randomMap: number[][];
}

const emptyState: GobanState = {
  signMap: [],
  width: 0,
  height: 0,
  rangeX: [0, Infinity],
  rangeY: [0, Infinity],
  animatedVertices: [],
  clearAnimatedVerticesHandler: null,
  xs: [],
  ys: [],
  hoshis: [],
  shiftMap: [],
  randomMap: [],
};

export default class Goban extends Component<GobanProps, GobanState> {
  static getDerivedStateFromProps: (props: GobanProps, state: GobanState) => Partial<GobanState>;

  constructor(props: GobanProps) {
    super(props);

    this.state = emptyState;
  }

  componentDidUpdate() {
    if (
      this.props.animateStonePlacement &&
      !this.state.clearAnimatedVerticesHandler &&
      this.state.animatedVertices.length > 0
    ) {
      // Handle stone animation

      for (let [x, y] of this.state.animatedVertices) {
        this.state.shiftMap[y][x] = random(7) + 1;
        readjustShifts(this.state.shiftMap, [x, y]);
      }

      this.setState({shiftMap: this.state.shiftMap});

      // Clear animation classes

      this.setState({
        clearAnimatedVerticesHandler: setTimeout(() => {
          this.setState({
            animatedVertices: [],
            clearAnimatedVerticesHandler: null,
          });
        }, this.props.animationDuration ?? 200),
      });
    }
  }

  render() {
    let {width, height, rangeX, rangeY, xs, ys, hoshis, shiftMap, randomMap} = this.state;

    let {
      innerProps = {},
      vertexSize = 24,
      coordX,
      coordY,
      busy,
      signMap,
      paintMap,
      heatMap,
      moveHintMap,
      markerMap,
      ghostStoneMap,
      fuzzyStonePlacement = false,
      showCoordinates = false,
      lines = [],
      selectedVertices = [],
      dimmedVertices = [],
    } = this.props;

    let animatedVertices = ([] as VertexPoint[]).concat(...this.state.animatedVertices.map(neighborhood));

    return h(
      'div',
      {
        ...innerProps,
        id: this.props.id,
        className: classnames(
          'shudan-goban',
          'shudan-goban-image',
          {
            'shudan-busy': busy,
            'shudan-coordinates': showCoordinates,
          },
          this.props.class ?? this.props.className
        ),
        style: {
          display: 'inline-grid',
          gridTemplateRows: showCoordinates ? '1em 1fr 1em' : '1fr',
          gridTemplateColumns: showCoordinates ? '1em 1fr 1em' : '1fr',
          fontSize: vertexSize,
          lineHeight: '1em',
          ...(this.props.style ?? {}),
        },
      },

      showCoordinates && h(CoordX, {xs, style: {gridRow: '1', gridColumn: '2'}, coordX}),
      showCoordinates &&
        h(CoordY, {
          height,
          ys,
          style: {gridRow: '2', gridColumn: '1'},
          coordY,
        }),

      h(
        'div',
        {
          className: 'shudan-content',
          style: {
            position: 'relative',
            width: `${xs.length}em`,
            height: `${ys.length}em`,
            gridRow: showCoordinates ? '2' : '1',
            gridColumn: showCoordinates ? '2' : '1',
          },
        },

        h(Grid, {
          vertexSize,
          width,
          height,
          xs,
          ys,
          hoshis,
        }),

        h(
          'div',
          {
            className: 'shudan-vertices',
            style: {
              display: 'grid',
              gridTemplateColumns: `repeat(${xs.length}, 1em)`,
              gridTemplateRows: `repeat(${ys.length}, 1em)`,
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 1,
            },
          },

          ys.map((y) =>
            xs.map((x) => {
              let equalsVertex = (v: VertexPoint) => vertexEquals(v, [x, y]);
              let selected = selectedVertices.some(equalsVertex);

              return h(
                Vertex,
                Object.assign(
                  {
                    key: [x, y].join('-'),
                    position: [x, y],

                    shift: fuzzyStonePlacement ? shiftMap?.[y]?.[x] : 0,
                    random: randomMap?.[y]?.[x],
                    sign: signMap?.[y]?.[x],

                    heat: heatMap?.[y]?.[x],
                    moveHint: moveHintMap?.[y]?.[x],
                    marker: markerMap?.[y]?.[x],
                    ghostStone: ghostStoneMap?.[y]?.[x],
                    dimmed: dimmedVertices.some(equalsVertex),
                    animate: animatedVertices.some(equalsVertex),

                    paint: paintMap?.[y]?.[x],

                    selected,
                    selectedLeft: selected && selectedVertices.some((v) => vertexEquals(v, [x - 1, y])),
                    selectedRight: selected && selectedVertices.some((v) => vertexEquals(v, [x + 1, y])),
                    selectedTop: selected && selectedVertices.some((v) => vertexEquals(v, [x, y - 1])),
                    selectedBottom: selected && selectedVertices.some((v) => vertexEquals(v, [x, y + 1])),
                  },

                  ...vertexEvents.map((e) => ({
                    [`on${e}`]: this.props[`onVertex${e}`],
                  }))
                )
              );
            })
          )
        ),

        h(
          'svg',
          {
            className: 'shudan-lines',
            style: {
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              pointerEvents: 'none',
              zIndex: 2,
            },
          },

          h(
            'g',
            {
              transform: `translate(-${rangeX[0] * vertexSize} -${rangeY[0] * vertexSize})`,
            },

            lines.map(({v1, v2, type}, i) => h(Line, {key: i, v1, v2, type, vertexSize}))
          )
        )
      ),

      showCoordinates &&
        h(CoordY, {
          height,
          ys,
          style: {gridRow: '2', gridColumn: '3'},
          coordY,
        }),
      showCoordinates && h(CoordX, {xs, style: {gridRow: '3', gridColumn: '2'}, coordX})
    );
  }
}

Goban.getDerivedStateFromProps = function (props: GobanProps, state: GobanState): Partial<GobanState> {
  let {signMap = [], rangeX = [0, Infinity], rangeY = [0, Infinity]} = props;

  let width = signMap.length === 0 ? 0 : signMap[0].length;
  let height = signMap.length;

  if (state.width === width && state.height === height) {
    let animatedVertices = state.animatedVertices;

    if (props.animateStonePlacement && props.fuzzyStonePlacement && state.clearAnimatedVerticesHandler == null) {
      animatedVertices = diffSignMap(state.signMap, signMap);
    }

    let result = {
      signMap,
      animatedVertices,
    };

    if (!vertexEquals(state.rangeX, rangeX) || !vertexEquals(state.rangeY, rangeY)) {
      // Range changed

      Object.assign(result, {
        rangeX,
        rangeY,
        xs: range(width).slice(rangeX[0], rangeX[1] + 1),
        ys: range(height).slice(rangeY[0], rangeY[1] + 1),
      });
    }

    return result;
  }

  // Board size changed

  return {
    signMap,
    width,
    height,
    rangeX,
    rangeY,
    animatedVertices: [],
    clearAnimatedVerticesHandler: null,
    xs: range(width).slice(rangeX[0], rangeX[1] + 1),
    ys: range(height).slice(rangeY[0], rangeY[1] + 1),
    hoshis: getHoshis(width, height),
    shiftMap: readjustShifts(signMap.map((row) => row.map((_) => random(8)))),
    randomMap: signMap.map((row) => row.map((_) => random(4))),
  };
};
