import {createElement as h, useCallback} from 'react';
import type {CSSProperties, MouseEvent, PointerEvent} from 'react';
import classnames from 'classnames';

import {avg, signEquals, vertexEvents, type Vertex as VertexPoint, type VertexEventName} from './helper';
import Marker, {type Marker as MarkerData} from './Marker';

type Sign = 0 | -1 | 1;
type VertexHandlerEvent = MouseEvent<HTMLDivElement> | PointerEvent<HTMLDivElement>;
export type VertexHandler = (evt: VertexHandlerEvent, vertex: VertexPoint) => void;

export interface GhostStone {
  sign: Sign;
  type?: 'good' | 'interesting' | 'doubtful' | 'bad' | null;
  faint?: boolean | null;
}

export interface HeatVertex {
  strength: number;
  text?: string | number | null;
}

export type VertexEventHandlers = Partial<Record<`on${VertexEventName}`, VertexHandler>>;

export interface VertexProps extends VertexEventHandlers {
  position: VertexPoint;
  shift?: number;
  random?: number;
  sign?: Sign;
  heat?: HeatVertex | null;
  paint?: Sign;
  paintLeft?: Sign;
  paintRight?: Sign;
  paintTop?: Sign;
  paintBottom?: Sign;
  paintTopLeft?: Sign;
  paintTopRight?: Sign;
  paintBottomLeft?: Sign;
  paintBottomRight?: Sign;
  dimmed?: boolean;
  marker?: MarkerData | null;
  ghostStone?: GhostStone | null;
  animate?: boolean;
  selected?: boolean;
  selectedLeft?: boolean;
  selectedRight?: boolean;
  selectedTop?: boolean;
  selectedBottom?: boolean;
}

const absoluteStyle = (zIndex?: number): CSSProperties => ({
  position: 'absolute',
  zIndex,
});

export default function Vertex(props: VertexProps) {
  let {
    position,
    shift,
    random,
    sign = 0,
    heat,
    paint = 0,
    paintLeft = 0,
    paintRight = 0,
    paintTop = 0,
    paintBottom = 0,
    paintTopLeft = 0,
    paintTopRight = 0,
    paintBottomLeft = 0,
    paintBottomRight = 0,
    dimmed,
    marker,
    ghostStone,
    animate,
    selected,
    selectedLeft,
    selectedRight,
    selectedTop,
    selectedBottom,
  } = props;

  let eventHandlers: Partial<Record<VertexEventName, (evt: VertexHandlerEvent) => void>> = {};

  for (let eventName of vertexEvents) {
    eventHandlers[eventName] = useCallback(
      (evt: VertexHandlerEvent) => {
        props[`on${eventName}`]?.(evt, position);
      },
      [...position, props[`on${eventName}`]]
    );
  }

  let markerMarkup = (zIndex?: number) =>
    !!marker &&
    h(Marker, {
      key: 'marker',
      sign,
      type: marker.type,
      label: marker.label,
      zIndex,
    });

  return h(
    'div',
    Object.assign(
      {
        'data-x': position[0],
        'data-y': position[1],

        'title': marker?.label,
        'style': {
          position: 'relative',
        } satisfies CSSProperties,
        'className': classnames('shudan-vertex', `shudan-random_${random}`, `shudan-sign_${sign}`, {
          [`shudan-shift_${shift}`]: !!shift,
          [`shudan-heat_${!!heat && heat.strength}`]: !!heat,
          'shudan-dimmed': dimmed,
          'shudan-animate': animate,

          [`shudan-paint_${paint > 0 ? 1 : -1}`]: !!paint,
          'shudan-paintedleft': !!paint && signEquals(paintLeft, paint),
          'shudan-paintedright': !!paint && signEquals(paintRight, paint),
          'shudan-paintedtop': !!paint && signEquals(paintTop, paint),
          'shudan-paintedbottom': !!paint && signEquals(paintBottom, paint),

          'shudan-selected': selected,
          'shudan-selectedleft': selectedLeft,
          'shudan-selectedright': selectedRight,
          'shudan-selectedtop': selectedTop,
          'shudan-selectedbottom': selectedBottom,

          [`shudan-marker_${marker?.type}`]: !!marker?.type,
          'shudan-smalllabel':
            marker?.type === 'label' && ((marker.label ?? '').includes('\n') || (marker.label ?? '').length >= 3),

          [`shudan-ghost_${ghostStone?.sign}`]: !!ghostStone,
          [`shudan-ghost_${ghostStone?.type}`]: !!ghostStone?.type,
          'shudan-ghost_faint': !!ghostStone?.faint,
        }),
      },
      ...vertexEvents.map((eventName) => ({
        [`on${eventName}`]: eventHandlers[eventName],
      }))
    ),

    !sign && markerMarkup(0),
    !sign &&
      !!ghostStone &&
      h('div', {
        key: 'ghost',
        className: 'shudan-ghost',
        style: absoluteStyle(1),
      }),

    h(
      'div',
      {key: 'stone', className: 'shudan-stone', style: absoluteStyle(2)},

      !!sign &&
        h(
          'div',
          {
            key: 'inner',
            className: classnames(
              'shudan-inner',
              'shudan-stone-image',
              `shudan-random_${random}`,
              `shudan-sign_${sign}`
            ),
            style: absoluteStyle(),
          },
          sign
        ),

      !!sign && markerMarkup()
    ),

    (!!paint || !!paintLeft || !!paintRight || !!paintTop || !!paintBottom) &&
      h('div', {
        key: 'paint',
        className: 'shudan-paint',
        style: {
          ...absoluteStyle(3),
          '--shudan-paint-opacity': avg(
            (!!paint
              ? [paint]
              : [paintLeft, paintRight, paintTop, paintBottom].filter((x) => x !== 0 && !isNaN(x))
            ).map((x) => Math.abs(x) * 0.5)
          ),
          '--shudan-paint-box-shadow': [
            signEquals(paintLeft, paintTop, paintTopLeft) ? [Math.sign(paintTop), '-.5em -.5em'] : null,
            signEquals(paintRight, paintTop, paintTopRight) ? [Math.sign(paintTop), '.5em -.5em'] : null,
            signEquals(paintLeft, paintBottom, paintBottomLeft) ? [Math.sign(paintBottom), '-.5em .5em'] : null,
            signEquals(paintRight, paintBottom, paintBottomRight) ? [Math.sign(paintBottom), '.5em .5em'] : null,
          ]
            .filter((x): x is [number, string] => x != null && x[0] !== 0)
            .map(
              ([sign, translation]) =>
                `${translation} 0 0 var(${
                  sign > 0 ? '--shudan-black-background-color' : '--shudan-white-background-color'
                })`
            )
            .join(','),
        } as CSSProperties,
      }),

    !!selected &&
      h('div', {
        key: 'selection',
        className: 'shudan-selection',
        style: absoluteStyle(4),
      }),

    h('div', {
      key: 'heat',
      className: 'shudan-heat',
      style: absoluteStyle(5),
    }),
    heat?.text != null &&
      h(
        'div',
        {
          key: 'heatlabel',
          className: 'shudan-heatlabel',
          style: absoluteStyle(6),
        },
        heat.text && heat.text.toString()
      )
  );
}
