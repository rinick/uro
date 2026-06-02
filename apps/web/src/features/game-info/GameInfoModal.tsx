import {Form, Input, Modal} from "antd";
import {useEffect} from "react";
import {useTranslation} from "react-i18next";

interface GameInfoModalProps {
  open: boolean;
  values: Record<string, string>;
  onCancel: () => void;
  onSave: (values: Record<string, string>) => void;
}

const gameInfoKeys = ["PB", "PW", "BR", "WR", "EV", "RO", "DT", "PC", "KM", "HA", "RU", "RE", "GN", "GC"];

export function GameInfoModal({open, values, onCancel, onSave}: GameInfoModalProps) {
  const {t} = useTranslation();
  const [form] = Form.useForm<Record<string, string>>();

  useEffect(() => {
    if (open) form.setFieldsValue(values);
  }, [form, open, values]);

  return (
    <Modal
      title={t("panels.gameInfo")}
      open={open}
      onCancel={onCancel}
      onOk={() => onSave(form.getFieldsValue())}
      okText={t("action.ok")}
      cancelText={t("action.cancel")}
      width={720}
    >
      <Form form={form} layout="vertical" className="game-info-form">
        {gameInfoKeys.map(key => (
          <Form.Item key={key} name={key} label={t(`gameInfo.${key}`)}>
            <Input size="small" />
          </Form.Item>
        ))}
      </Form>
    </Modal>
  );
}
