import {Checkbox, Form, InputNumber, Modal, Select, message} from 'antd';
import {useEffect, useState} from 'react';
import {useTranslation} from 'react-i18next';
import {defaultAnalysisSettings, type AnalysisSettings} from '@uro/analysis-core';

interface AnalysisSettingsModalProps {
  open: boolean;
  settings: AnalysisSettings;
  showKataGoSettings?: boolean;
  onCancel: () => void;
  onSave: (settings: AnalysisSettings) => void;
}

export function AnalysisSettingsModal({
  open,
  settings,
  showKataGoSettings = false,
  onCancel,
  onSave,
}: AnalysisSettingsModalProps) {
  const {t} = useTranslation();
  const [form] = Form.useForm<AnalysisSettings>();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;

    form.setFieldsValue({...defaultAnalysisSettings, ...settings});
    if (!showKataGoSettings || window.uro == null) return;

    setLoading(true);
    window.uro.analysis
      .getSettings()
      .then((settings) => {
        const next = {...defaultAnalysisSettings, ...settings};
        form.setFieldsValue(next);
        onSave(next);
      })
      .catch((error: unknown) => message.error(error instanceof Error ? error.message : t('analysis.loadFailed')))
      .finally(() => setLoading(false));
  }, [form, onSave, open, settings, showKataGoSettings, t]);

  async function handleSave(): Promise<void> {
    try {
      setSaving(true);
      const fields = await form.validateFields();
      const current = window.uro == null ? settings : await window.uro.analysis.getSettings();
      const values = {...defaultAnalysisSettings, ...current, ...fields};
      if (window.uro != null) await window.uro.analysis.saveSettings(values);
      onSave(values);
      message.success(t('analysis.saved'));
      onCancel();
    } catch (error) {
      if (error instanceof Error) message.error(error.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title={t('analysis.title')}
      open={open}
      onCancel={onCancel}
      onOk={() => void handleSave()}
      okText={t('action.save')}
      confirmLoading={saving}
      width={420}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" disabled={loading} initialValues={defaultAnalysisSettings}>
        {showKataGoSettings ? (
          <>
            <Form.Item name="autoAnalyze" valuePropName="checked">
              <Checkbox>{t('analysis.autoAnalyze')}</Checkbox>
            </Form.Item>
            <Form.Item name="moveDisplay" label={t('analysis.moveDisplay')}>
              <Select
                size="small"
                options={[
                  {value: 'score', label: t('analysis.score')},
                  {value: 'winrate', label: t('analysis.winrate')},
                  {value: 'absScore', label: t('analysis.value')},
                ]}
              />
            </Form.Item>
            <Form.Item name="minVisits" label={t('analysis.minVisits')}>
              <InputNumber size="small" min={1} />
            </Form.Item>
          </>
        ) : null}
        <Form.Item name="maxMoves" label={t('analysis.moveNumberCount')}>
          <Select
            size="small"
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
