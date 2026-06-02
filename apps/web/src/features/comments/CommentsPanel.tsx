import {Input} from "antd";
import {useTranslation} from "react-i18next";

interface CommentsPanelProps {
  value: string;
  onChange: (value: string) => void;
}

export function CommentsPanel({value, onChange}: CommentsPanelProps) {
  const {t} = useTranslation();

  return (
    <section className="side-panel comments-panel">
      <h2>{t("panels.comments")}</h2>
      <Input.TextArea size="small" value={value} onChange={event => onChange(event.target.value)} autoSize={false} />
    </section>
  );
}
