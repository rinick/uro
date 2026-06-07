import {
  BackwardOutlined,
  BorderOutlined,
  CloseOutlined,
  DeleteOutlined,
  FastBackwardOutlined,
  FastForwardOutlined,
  FontSizeOutlined,
  ForwardOutlined,
  NumberOutlined,
  RadiusSettingOutlined,
  StepBackwardOutlined,
  StepForwardOutlined,
} from '@ant-design/icons';
import {Button, Segmented, Space, Tooltip} from 'antd';
import type React from 'react';
import {useTranslation} from 'react-i18next';
import type {EditorTool} from './types';

interface EditorToolbarProps {
  tool: EditorTool;
  nextColor: 'B' | 'W';
  canNavigatePrevious: boolean;
  canNavigateNext: boolean;
  onToolChange: (tool: EditorTool) => void;
  onAutoToolClick: () => void;
  onPass: () => void;
  onFirst: () => void;
  onPrevious10: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onNext10: () => void;
  onLast: () => void;
  extraEnd?: React.ReactNode;
}

export function EditorToolbar({
  tool,
  nextColor,
  canNavigatePrevious,
  canNavigateNext,
  onToolChange,
  onAutoToolClick,
  onPass,
  onFirst,
  onPrevious10,
  onPrevious,
  onNext,
  onNext10,
  onLast,
  extraEnd,
}: EditorToolbarProps) {
  const {t} = useTranslation();

  return (
    <div className="editor-toolbar">
      <Segmented
        className="edit-tools"
        size="small"
        value={tool}
        onChange={(value) => {
          const nextTool = value as EditorTool;
          if (nextTool === 'pass') {
            onPass();
            return;
          }
          onToolChange(nextTool);
        }}
        options={[
          {
            value: 'auto',
            label: withTip(<AutoPlayIcon nextColor={nextColor} onClick={onAutoToolClick} />, t('tools.auto')),
          },
          {value: 'pass', icon: withTip(<PalmIcon />, t('tools.pass'))},
          {value: 'black', label: withTip(<span className="tool-stone black" />, t('tools.black'))},
          {value: 'white', label: withTip(<span className="tool-stone white" />, t('tools.white'))},
          {value: 'erase', icon: withTip(<DeleteOutlined />, t('tools.erase'))},
          {value: 'number', icon: withTip(<NumberOutlined />, t('tools.number'))},
          {value: 'alphabet', icon: withTip(<FontSizeOutlined />, t('tools.alphabet'))},
          {value: 'circle', icon: withTip(<RadiusSettingOutlined />, t('tools.circle'))},
          {value: 'square', icon: withTip(<BorderOutlined />, t('tools.square'))},
          {value: 'triangle', label: withTip(<span className="tool-triangle" />, t('tools.triangle'))},
          {value: 'cross', icon: withTip(<CloseOutlined />, t('tools.cross'))},
          {value: 'selected', label: withTip(<span className="tool-point" />, t('tools.selected'))},
        ]}
      />
      <Space.Compact className="navigation-tools">
        <NavButton
          title={t('nav.first')}
          disabled={!canNavigatePrevious}
          icon={<StepBackwardOutlined />}
          onClick={onFirst}
        />
        <NavButton
          title={t('nav.previous10')}
          disabled={!canNavigatePrevious}
          icon={<FastBackwardOutlined />}
          onClick={onPrevious10}
        />
        <NavButton
          title={t('nav.previous')}
          disabled={!canNavigatePrevious}
          icon={<BackwardOutlined />}
          onClick={onPrevious}
        />
        <NavButton title={t('nav.next')} disabled={!canNavigateNext} icon={<ForwardOutlined />} onClick={onNext} />
        <NavButton
          title={t('nav.next10')}
          disabled={!canNavigateNext}
          icon={<FastForwardOutlined />}
          onClick={onNext10}
        />
        <NavButton title={t('nav.last')} disabled={!canNavigateNext} icon={<StepForwardOutlined />} onClick={onLast} />
      </Space.Compact>
      {extraEnd}
    </div>
  );
}

function AutoPlayIcon({nextColor, onClick}: {nextColor: 'B' | 'W'; onClick: () => void}) {
  return (
    <span
      className={`auto-play-icon ${nextColor === 'B' ? 'black-next' : 'white-next'}`}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
    >
      <span className="auto-stone auto-stone-white" />
      <span className="auto-stone auto-stone-black" />
    </span>
  );
}

function PalmIcon() {
  return (
    <svg className="palm-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 11V6.5a1.2 1.2 0 0 1 2.4 0V11" />
      <path d="M10.4 11V4.5a1.2 1.2 0 0 1 2.4 0V11" />
      <path d="M12.8 11V5.5a1.2 1.2 0 0 1 2.4 0V12" />
      <path d="M15.2 12V8a1.2 1.2 0 0 1 2.4 0v5.8c0 4-2.3 6.2-5.7 6.2h-.8c-2.4 0-4-1.1-5.2-3.1L4 13.6a1.35 1.35 0 0 1 2.3-1.4L8 14.4V11" />
    </svg>
  );
}

function NavButton({
  title,
  icon,
  disabled,
  onClick,
}: {
  title: string;
  icon: React.ReactNode;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <Tooltip title={title}>
      <Button size="small" aria-label={title} disabled={disabled} icon={icon} onClick={onClick} />
    </Tooltip>
  );
}

function withTip(node: React.ReactNode, title: string): React.ReactNode {
  return <Tooltip title={title}>{node}</Tooltip>;
}
