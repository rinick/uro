import {Button, Checkbox, Form, InputNumber, Modal, Select, Switch, message} from 'antd';
import {useEffect, useState} from 'react';
import {useTranslation} from 'react-i18next';
import {defaultAnalysisSettings, type AnalysisSettings} from '@ulugo/analysis-core';
import {type AppLanguage, languageOptions} from '../../app/appUiUtils';

interface AnalysisSettingsModalProps {
  open: boolean;
  settings: AnalysisSettings;
  language: AppLanguage;
  showCoordinates: boolean;
  showMarkup: boolean;
  showKataGoSettings?: boolean;
  onCancel: () => void;
  onSettingsChange: (settings: AnalysisSettings) => void;
  onLanguageChange: (language: AppLanguage) => void;
  onShowCoordinatesChange: (showCoordinates: boolean) => void;
  onShowMarkupChange: (showMarkup: boolean) => void;
  onKeyboardShortcutsClick: () => void;
}

export function AnalysisSettingsModal({
  open,
  settings,
  language,
  showCoordinates,
  showMarkup,
  showKataGoSettings = false,
  onCancel,
  onSettingsChange,
  onLanguageChange,
  onShowCoordinatesChange,
  onShowMarkupChange,
  onKeyboardShortcutsClick,
}: AnalysisSettingsModalProps) {
  const {t} = useTranslation();
  const [form] = Form.useForm<AnalysisSettings>();
  const [loading, setLoading] = useState(false);
  const [minVisitsDraft, setMinVisitsDraft] = useState(defaultAnalysisSettings.minVisits);

  useEffect(() => {
    if (!open) return;
    form.setFieldsValue({...defaultAnalysisSettings, ...settings});
    setMinVisitsDraft(settings.minVisits);
  }, [form, open, settings]);

  useEffect(() => {
    if (!open) return;
    if (!showKataGoSettings || window.ulugo == null) return;

    let active = true;
    setLoading(true);
    window.ulugo.analysis
      .getSettings()
      .then((settings) => {
        if (!active) return;
        const next = {...defaultAnalysisSettings, ...settings};
        form.setFieldsValue(next);
        setMinVisitsDraft(next.minVisits);
        onSettingsChange(next);
      })
      .catch((error: unknown) => message.error(error instanceof Error ? error.message : t('analysis.loadFailed')))
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [form, onSettingsChange, open, showKataGoSettings, t]);

  function updateSettings(values: Partial<AnalysisSettings>): void {
    onSettingsChange({...defaultAnalysisSettings, ...settings, ...values});
  }

  function commitMinVisits(): void {
    const minVisits = Math.max(1, Number(minVisitsDraft) || defaultAnalysisSettings.minVisits);
    setMinVisitsDraft(minVisits);
    form.setFieldValue('minVisits', minVisits);
    updateSettings({minVisits});
  }

  return (
    <Modal title={t('settings.title')} open={open} onCancel={onCancel} footer={null} width={420} destroyOnHidden>
      <Form form={form} layout="vertical" disabled={loading} initialValues={defaultAnalysisSettings}>
        <Form.Item label={t('menu.language')}>
          <Select
            size="small"
            value={language}
            popupMatchSelectWidth={false}
            onChange={(value) => onLanguageChange(value as AppLanguage)}
            options={languageOptions}
          />
        </Form.Item>
        <Form.Item>
          <div className="app-settings-row">
            <span>{t('menu.coordinates')}</span>
            <Switch size="small" checked={showCoordinates} onChange={onShowCoordinatesChange} />
          </div>
        </Form.Item>
        <Form.Item>
          <div className="app-settings-row">
            <span>{t('settings.showMarkup')}</span>
            <Switch size="small" checked={showMarkup} onChange={onShowMarkupChange} />
          </div>
        </Form.Item>
        <Form.Item>
          <Button block onClick={onKeyboardShortcutsClick}>
            {t('shortcuts.button')}
          </Button>
        </Form.Item>
        {showKataGoSettings ? (
          <>
            <Form.Item>
              <Checkbox
                checked={settings.autoAnalyze}
                onChange={(event) => updateSettings({autoAnalyze: event.target.checked})}
              >
                {t('analysis.autoAnalyze')}
              </Checkbox>
            </Form.Item>
            <Form.Item label={t('analysis.moveDisplay')}>
              <Select
                size="small"
                value={settings.moveDisplay}
                onChange={(value) => updateSettings({moveDisplay: value as AnalysisSettings['moveDisplay']})}
                options={[
                  {value: 'score', label: t('analysis.score')},
                  {value: 'winrate', label: t('analysis.winrate')},
                  {value: 'absScore', label: t('analysis.value')},
                ]}
              />
            </Form.Item>
            <Form.Item label={t('analysis.minVisits')}>
              <InputNumber
                size="small"
                min={1}
                value={minVisitsDraft}
                onChange={(value) => setMinVisitsDraft(Number(value) || defaultAnalysisSettings.minVisits)}
                onBlur={commitMinVisits}
                onPressEnter={commitMinVisits}
              />
            </Form.Item>
          </>
        ) : null}
        <Form.Item label={t('analysis.moveNumberCount')}>
          <Select
            size="small"
            value={settings.maxMoves}
            onChange={(value) => updateSettings({maxMoves: value as AnalysisSettings['maxMoves']})}
            options={[
              {value: 1, label: '1'},
              {value: 5, label: '5'},
              {value: 20, label: '20'},
              {value: 'all', label: t('moveNumbers.all')},
            ]}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}
