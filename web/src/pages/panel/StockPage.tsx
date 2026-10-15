import { DownloadOutlined, HistoryOutlined, SaveOutlined, SearchOutlined, UploadOutlined } from '@ant-design/icons';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Drawer, Input, InputNumber, Modal, Select, Table, Upload } from 'antd';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { api, ApiError } from '../../api/client';
import { useDictionaries } from '../../api/hooks';
import type { Availability, Page, Part } from '../../api/types';
import { AvailabilityBadge, ease } from '../../components/ui';
import { ago, fmtDateTime } from '../../format';

interface StockPage extends Page<Part> {
  lastImport: { fileName: string; at: string; by: string } | null;
}
interface ImportResult {
  fileName: string;
  rowsTotal: number;
  rowsUpdated: number;
  rowsFailed: number;
  errors: { row: number; message: string }[];
}

const AV_OPTIONS = [
  { value: 'IN_STOCK', label: 'В наличии' },
  { value: 'ON_ORDER', label: 'Под заказ' },
  { value: 'OUT_OF_STOCK', label: 'Нет на складе' },
];

export default function StockPage() {
  const qc = useQueryClient();
  const { message } = App.useApp();
  const { data: dict } = useDictionaries();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<number>();
  const [page, setPage] = useState(1);
  const [edits, setEdits] = useState<Record<number, { quantity?: number; availability?: Availability }>>({});
  const [saved, setSaved] = useState<Set<number>>(new Set());
  const [result, setResult] = useState<ImportResult | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  const params = new URLSearchParams({ page: String(page), pageSize: '25' });
  if (q) params.set('q', q);
  if (cat) params.set('categoryId', String(cat));
  const { data, isLoading } = useQuery({
    queryKey: ['panel', 'stock', params.toString()],
    queryFn: () => api.get<StockPage>(`/panel/stock?${params}`),
    placeholderData: keepPreviousData,
  });
  const imports = useQuery({
    queryKey: ['panel', 'imports'],
    queryFn: () => api.get<{ id: number; fileName: string; by: string; at: string; rowsTotal: number; rowsFailed: number }[]>('/panel/stock/imports'),
    enabled: historyOpen,
  });

  const save = useMutation({
    mutationFn: ({ partId, body }: { partId: number; body: object }) => api.patch<Part>(`/panel/stock/${partId}`, body),
    onSuccess: (part) => {
      setEdits(({ [part.id]: _, ...rest }) => rest);
      setSaved((s) => new Set(s).add(part.id));
      setTimeout(() => setSaved((s) => { const n = new Set(s); n.delete(part.id); return n; }), 1500);
      if (part.warning) message.warning(part.warning, 6);
      else message.success(`«${part.name}»: остаток сохранён. Судовладельцы уже видят новое значение.`);
      qc.invalidateQueries({ queryKey: ['panel', 'stock'] });
      qc.invalidateQueries({ queryKey: ['dictionaries'] });
    },
    onError: (e) => message.error((e as ApiError).message),
  });

  const upload = async (file: File) => {
    try {
      const res = await api.upload<ImportResult>('/panel/stock/import', file);
      setResult(res);
      qc.invalidateQueries({ queryKey: ['panel'] });
      qc.invalidateQueries({ queryKey: ['dictionaries'] });
    } catch (e) {
      message.error((e as ApiError).message);
    }
    return false;
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3, ease }}>
      <div className="card card-pad" style={{ marginBottom: 20, display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between' }}>
        <div>
          <b>Загрузка остатков из файла</b>
          <div className="muted" style={{ fontSize: 14 }}>
            CSV или Excel со столбцами «каталожный номер», «количество», «статус» — выгрузка из складской системы НСРЗ.
            {data?.lastImport && (
              <>
                {' '}
                Последняя загрузка: <b>{data.lastImport.fileName}</b>, {ago(data.lastImport.at)} ({data.lastImport.by}).
              </>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Upload accept=".csv,.xlsx" showUploadList={false} beforeUpload={(f) => upload(f as unknown as File)}>
            <Button type="primary" icon={<UploadOutlined />}>
              Загрузить файл
            </Button>
          </Upload>
          <Button icon={<DownloadOutlined />} onClick={() => api.download('/panel/stock/template.csv', 'остатки-шаблон.csv')}>
            Шаблон
          </Button>
          <Button icon={<HistoryOutlined />} onClick={() => setHistoryOpen(true)}>
            Журнал загрузок
          </Button>
        </div>
      </div>

      <div className="card card-pad">
        <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
          <Input allowClear prefix={<SearchOutlined className="faint" />} placeholder="Номер или наименование" style={{ width: 320 }} value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
          <Select allowClear placeholder="Категория" style={{ width: 260 }} value={cat} onChange={(v) => { setCat(v); setPage(1); }} options={dict?.categories.map((c) => ({ value: c.id, label: c.name }))} />
        </div>
        <Table
          rowKey="id"
          loading={isLoading}
          dataSource={data?.items}
          rowClassName={(p) => (saved.has(p.id) ? 'row-saved' : '')}
          pagination={{ current: page, pageSize: 25, total: data?.total, onChange: setPage, showSizeChanger: false }}
          columns={[
            { title: 'Номер', width: 170, render: (_, p) => <span className="mono">{p.catalogNumber}</span> },
            { title: 'Наименование', render: (_, p) => <div><div style={{ fontWeight: 600 }}>{p.name}</div><div className="faint" style={{ fontSize: 12.5 }}>{p.category.name}</div></div> },
            {
              title: 'На складе',
              width: 130,
              render: (_, p) => (
                <InputNumber
                  min={0}
                  max={1000000}
                  precision={0}
                  value={edits[p.id]?.quantity ?? p.stock.quantity}
                  onChange={(v) => setEdits((e) => ({ ...e, [p.id]: { ...e[p.id], quantity: v ?? 0 } }))}
                  onPressEnter={() => edits[p.id] && save.mutate({ partId: p.id, body: edits[p.id] })}
                  addonAfter={p.unit}
                  style={{ width: 120 }}
                />
              ),
            },
            { title: 'Резерв', width: 80, align: 'right', render: (_, p) => <span className={p.stock.reserved ? '' : 'faint'}>{p.stock.reserved}</span> },
            {
              title: 'Статус',
              width: 170,
              render: (_, p) => (
                <Select
                  style={{ width: 160 }}
                  value={edits[p.id]?.availability ?? (p.stock.allReserved ? 'IN_STOCK' : p.stock.availability === 'OUT_OF_STOCK' && p.stock.quantity > 0 ? 'IN_STOCK' : p.stock.availability)}
                  options={AV_OPTIONS}
                  onChange={(v) => setEdits((e) => ({ ...e, [p.id]: { ...e[p.id], availability: v } }))}
                />
              ),
            },
            { title: 'Для заказчика', width: 190, render: (_, p) => <AvailabilityBadge stock={p.stock} unit={p.unit} lead={p.leadTimeDays} /> },
            { title: 'Обновлено', width: 150, render: (_, p) => <div style={{ fontSize: 12.5 }}><div>{fmtDateTime(p.stock.updatedAt)}</div><div className="faint">{p.updatedBy}</div></div> },
            {
              title: '',
              width: 130,
              render: (_, p) => (
                <AnimatePresence>
                  {edits[p.id] && (
                    <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }}>
                      <Button type="primary" icon={<SaveOutlined />} loading={save.isPending && save.variables?.partId === p.id} onClick={() => save.mutate({ partId: p.id, body: edits[p.id] })}>
                        Сохранить
                      </Button>
                    </motion.div>
                  )}
                </AnimatePresence>
              ),
            },
          ]}
        />
      </div>

      <Modal open={!!result} title={`Файл «${result?.fileName}» обработан`} onCancel={() => setResult(null)} footer={<Button type="primary" onClick={() => setResult(null)}>Готово</Button>}>
        {result && (
          <div>
            <div style={{ display: 'flex', gap: 24, margin: '8px 0 16px' }}>
              <div><div className="faint">Строк</div><b style={{ fontSize: 22 }}>{result.rowsTotal}</b></div>
              <div><div className="faint">Обновлено</div><b style={{ fontSize: 22, color: 'var(--success)' }}>{result.rowsUpdated}</b></div>
              <div><div className="faint">С ошибками</div><b style={{ fontSize: 22, color: result.rowsFailed ? 'var(--danger)' : undefined }}>{result.rowsFailed}</b></div>
            </div>
            {result.errors.length > 0 && (
              <Table size="small" rowKey="row" pagination={false} dataSource={result.errors} columns={[{ title: 'Строка', dataIndex: 'row', width: 80 }, { title: 'Ошибка', dataIndex: 'message' }]} />
            )}
          </div>
        )}
      </Modal>

      <Drawer open={historyOpen} onClose={() => setHistoryOpen(false)} title="Журнал загрузок остатков" width={520}>
        <Table
          size="small"
          rowKey="id"
          loading={imports.isLoading}
          dataSource={imports.data}
          pagination={false}
          columns={[
            { title: 'Файл', render: (_, r) => <div><b>{r.fileName}</b><div className="faint" style={{ fontSize: 12 }}>{r.by}</div></div> },
            { title: 'Когда', render: (_, r) => fmtDateTime(r.at) },
            { title: 'Строк / ошибок', render: (_, r) => `${r.rowsTotal} / ${r.rowsFailed}` },
          ]}
        />
      </Drawer>
    </motion.div>
  );
}
