import {createElement as h, useCallback} from 'react';
import type {CSSProperties, MouseEvent, PointerEvent} from 'react';
import classnames from 'classnames';

import {vertexEvents, type Vertex as VertexPoint, type VertexEventName} from './helper';
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
  heat?: boolean;
  dot?: boolean;
  text?: string | number | null;
}

export interface MoveHint {
  best?: boolean;
  branch?: 'main' | 'variation';
  sign?: Sign;
}

export type VertexEventHandlers = Partial<Record<`on${VertexEventName}`, VertexHandler>>;

export interface VertexProps extends VertexEventHandlers {
  position: VertexPoint;
  shift?: number;
  random?: number;
  sign?: Sign;
  heat?: HeatVertex | null;
  moveHint?: MoveHint | null;
  paint?: number;
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

const absoluteStyle = (): CSSProperties => ({
  position: 'absolute',
});

export default function Vertex(props: VertexProps) {
  let {
    position,
    shift,
    random,
    sign = 0,
    heat,
    moveHint,
    paint = 0,
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

  let paintOpacity = Math.min(1, Math.abs(paint) * 0.5);

  let markerMarkup = () =>
    !!marker &&
    h(Marker, {
      key: 'marker',
      sign,
      type: marker.type,
      label: marker.label,
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
          [`shudan-heat_${heat?.strength}`]: (heat?.strength ?? 0) > 0,
          'shudan-bestmove': !!moveHint?.best,
          [`shudan-nextmove_${moveHint?.branch}`]: !!moveHint?.branch,
          [`shudan-nextmove-sign_${moveHint?.sign}`]: !!moveHint?.sign,
          'shudan-dimmed': dimmed,
          'shudan-animate': animate,

          [`shudan-paint_${paint > 0 ? 1 : -1}`]: !!paint,

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

    !sign && markerMarkup(),
    !sign &&
      !!ghostStone &&
      h('div', {
        key: 'ghost',
        className: 'shudan-ghost',
        style: absoluteStyle(),
      }),

    h('div', {
      key: 'heat',
      className: classnames('shudan-heat', {
        [`shudan-heat_${heat?.strength}`]: (heat?.heat ?? true) && (heat?.strength ?? 0) > 0,
      }),
      style: absoluteStyle(),
    }),

    h(
      'div',
      {key: 'stone', className: 'shudan-stone', style: absoluteStyle()},

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

    !!paint &&
      h('div', {
        key: 'paint',
        className: 'shudan-paint',
        style: {
          ...absoluteStyle(),
          '--shudan-paint-opacity': paintOpacity,
        } as CSSProperties,
      }),

    !!moveHint?.best &&
      h('div', {
        key: 'bestmove',
        className: 'shudan-movehint shudan-movehint-best',
        style: absoluteStyle(),
      }),

    moveHint?.branch != null &&
      h('div', {
        key: 'nextmove',
        className: 'shudan-movehint shudan-movehint-next',
        style: absoluteStyle(),
      }),

    !!heat?.dot &&
      h('div', {
        key: 'analysisdot',
        className: classnames('shudan-analysisdot', {
          [`shudan-heat_${heat?.strength}`]: (heat?.strength ?? 0) > 0,
        }),
        style: absoluteStyle(),
      }),

    !!selected &&
      h('div', {
        key: 'selection',
        className: 'shudan-selection',
        style: absoluteStyle(),
      }),
    heat?.text != null &&
      h(
        'div',
        {
          key: 'heatlabel',
          className: 'shudan-heatlabel',
          style: absoluteStyle(),
        },
        heat.text && heat.text.toString()
      )
  );
}
