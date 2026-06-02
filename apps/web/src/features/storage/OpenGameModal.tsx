import {Button, Modal, Space, Table} from 'antd';
import type {ColumnsType} from 'antd/es/table';
import {useMemo} from 'react';
import {useTranslation} from 'react-i18next';
import type {StoredGameSummary} from './gameStorage';

interface OpenGameModalProps {
  open: boolean;
  games: StoredGameSummary[];
  selectedId: string | null;
  loading: boolean;
  onSelect: (id: string | null) => void;
  onOpen: () => void;
  onDelete: () => void;
  onCancel: () => void;
}

export function OpenGameModal({
  open,
  games,
  selectedId,
  loading,
  onSelect,
  onOpen,
  onDelete,
  onCancel,
}: OpenGameModalProps) {
  const {t} = useTranslation();
  const columns = useMemo<ColumnsType<StoredGameSummary>>(
    () => [
      {title: t('savedGames.gameName'), dataIndex: 'gameName', key: 'gameName'},
      {title: t('savedGames.date'), dataIndex: 'date', key: 'date', width: 110},
      {title: t('savedGames.blackPlayer'), dataIndex: 'blackPlayer', key: 'blackPlayer'},
      {title: t('savedGames.whitePlayer'), dataIndex: 'whitePlayer', key: 'whitePlayer'},
      {title: t('savedGames.result'), dataIndex: 'result', key: 'result', width: 90},
      {title: t('savedGames.moves'), dataIndex: 'moveCount', key: 'moveCount', width: 80, align: 'right'},
    ],
    [t]
  );

  return (
    <Modal
      title={t('savedGames.openTitle')}
      open={open}
      onCancel={onCancel}
      width={860}
      footer={
        <Space>
          <Button size="small" onClick={onCancel}>
            {t('action.cancel')}
          </Button>
          <Button size="small" danger disabled={selectedId == null} onClick={onDelete}>
            {t('action.delete')}
          </Button>
          <Button size="small" type="primary" disabled={selectedId == null} onClick={onOpen}>
            {t('action.open')}
          </Button>
        </Space>
      }
    >
      <Table
        size="small"
        rowKey="id"
        columns={columns}
        dataSource={games}
        loading={loading}
        pagination={false}
        scroll={{y: 360}}
        rowSelection={{
          type: 'radio',
          selectedRowKeys: selectedId == null ? [] : [selectedId],
          onChange: (keys) => onSelect(String(keys[0] ?? '')),
        }}
        onRow={(record) => ({
          onClick: () => onSelect(record.id),
          onDoubleClick: onOpen,
        })}
      />
    </Modal>
  );
}
