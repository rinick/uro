import {Checkbox, Form, InputNumber, Modal, Segmented, Select, message} from 'antd';
import {useEffect, useState} from 'react';
import {useTranslation} from 'react-i18next';
import {defaultAnalysisSettings, type AnalysisSettings} from '@uro/analysis-core';

interface AnalysisSettingsModalProps {
  open: boolean;
  onCancel: () => void;
  onSave: (settings: AnalysisSettings) => void;
}

export function AnalysisSettingsModal({open, onCancel, onSave}: AnalysisSettingsModalProps) {
  const {t} = useTranslation();
  const [form] = Form.useForm<AnalysisSettings>();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || window.uro == null) return;

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
  }, [form, onSave, open, t]);

  async function handleSave(): Promise<void> {
    try {
      setSaving(true);
      const values = {...defaultAnalysisSettings, ...(await form.validateFields())};
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
        <Form.Item name="moveDisplay" label={t('analysis.moveDisplay')}>
          <Select
            size="small"
            options={[
              {value: 'score', label: t('analysis.score')},
              {value: 'winrate', label: t('analysis.winrate')},
              {value: 'absScore', label: t('analysis.absScore')},
            ]}
          />
        </Form.Item>
        <Form.Item name="topMoveDisplay" label={t('analysis.candidateDisplay')}>
          <Segmented
            size="small"
            options={[
              {value: 'dot', label: t('analysis.dot')},
              {value: 'number', label: t('analysis.number')},
              {value: 'none', label: t('analysis.none')},
            ]}
          />
        </Form.Item>
        <Form.Item name="maxMoves" label={t('analysis.maxMoves')}>
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
        <Form.Item name="minVisits" label={t('analysis.minVisits')}>
          <InputNumber size="small" min={1} />
        </Form.Item>
        <Form.Item name="showNextMove" valuePropName="checked">
          <Checkbox>{t('analysis.nextMove')}</Checkbox>
        </Form.Item>
        <Form.Item name="showTopMoves" valuePropName="checked">
          <Checkbox>{t('analysis.topMoves')}</Checkbox>
        </Form.Item>
        <Form.Item name="showExpectedTerritory" valuePropName="checked">
          <Checkbox>{t('analysis.expectedTerritory')}</Checkbox>
        </Form.Item>
      </Form>
    </Modal>
  );
}
