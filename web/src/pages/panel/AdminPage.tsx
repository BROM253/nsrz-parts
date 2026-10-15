import { PlusOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Form, Input, Modal, Select, Switch, Table, Tabs, Tag } from 'antd';
import { motion } from 'motion/react';
import { useState } from 'react';
import { api, ApiError } from '../../api/client';
import { useDictionaries } from '../../api/hooks';
import { useAuth } from '../../auth';
import { ease } from '../../components/ui';
import { fmtDateTime, ROLE_TITLES } from '../../format';

interface UserRow {
  id: string;
  fullName: string;
  role: string;
  phone: string | null;
  email: string | null;
  company: { id: string; name: string } | null;
  isActive: boolean;
}
interface CompanyRow {
  id: string;
  name: string;
  inn: string | null;
  contactPhone: string | null;
  usersCount: number;
  ordersCount: number;
  vessels: { id: string; name: string; imoNumber: string | null; vesselType: string }[];
}
interface NotificationRow {
  id: number;
  channel: 'SMS' | 'EMAIL';
  recipient: string;
  subject: string | null;
  body: string;
  status: 'SENT' | 'LOGGED' | 'FAILED';
  provider: string;
  error: string | null;
  orderNumber: string | null;
  at: string;
}

function Users({ isAdmin }: { isAdmin: boolean }) {
  const qc = useQueryClient();
  const { message } = App.useApp();
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  const users = useQuery({ queryKey: ['admin', 'users'], queryFn: () => api.get<UserRow[]>('/admin/users') });
  const companies = useQuery({ queryKey: ['admin', 'companies'], queryFn: () => api.get<CompanyRow[]>('/admin/companies') });
  const toggle = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => api.patch(`/admin/users/${id}`, { isActive }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'users'] }),
    onError: (e) => message.error((e as ApiError).message),
  });
  const create = useMutation({
    mutationFn: (v: object) => api.post('/admin/users', v),
    onSuccess: () => {
      message.success('Пользователь добавлен — он может войти по коду');
      setOpen(false);
      form.resetFields();
      qc.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
    onError: (e) => message.error((e as ApiError).message),
  });
  const role = Form.useWatch('role', form);

  return (
    <>
      {isAdmin && (
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)} style={{ marginBottom: 16 }}>
          Добавить пользователя
        </Button>
      )}
      <Table
        rowKey="id"
        loading={users.isLoading}
        dataSource={users.data}
        pagination={false}
        columns={[
          { title: 'ФИО', render: (_, u) => <b style={{ opacity: u.isActive ? 1 : 0.5 }}>{u.fullName}</b> },
          { title: 'Роль', render: (_, u) => <Tag bordered={false} color={u.role === 'OWNER' ? 'blue' : u.role === 'ADMIN' ? 'volcano' : 'orange'}>{ROLE_TITLES[u.role]}</Tag> },
          { title: 'Компания', render: (_, u) => u.company?.name ?? 'АО «НСРЗ»' },
          { title: 'Вход', render: (_, u) => [u.phone, u.email].filter(Boolean).join(' · ') },
          { title: 'Доступ', render: (_, u) => <Switch checked={u.isActive} disabled={!isAdmin} loading={toggle.isPending && toggle.variables?.id === u.id} onChange={(v) => toggle.mutate({ id: u.id, isActive: v })} /> },
        ]}
      />
      <Modal open={open} title="Новый пользователь" okText="Добавить" cancelText="Отмена" onCancel={() => setOpen(false)} onOk={() => form.submit()} confirmLoading={create.isPending}>
        <Form form={form} layout="vertical" onFinish={(v) => create.mutate(v)} initialValues={{ role: 'OWNER' }}>
          <Form.Item name="fullName" label="ФИО" rules={[{ required: true, min: 3 }]}>
            <Input />
          </Form.Item>
          <Form.Item name="role" label="Роль">
            <Select options={Object.entries(ROLE_TITLES).map(([value, label]) => ({ value, label }))} />
          </Form.Item>
          {role === 'OWNER' && (
            <Form.Item name="companyId" label="Компания" rules={[{ required: true }]}>
              <Select options={companies.data?.map((c) => ({ value: c.id, label: c.name }))} />
            </Form.Item>
          )}
          <Form.Item name="phone" label="Телефон">
            <Input placeholder="+7 900 000-00-00" />
          </Form.Item>
          <Form.Item name="email" label="Почта">
            <Input placeholder="name@company.ru" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}

function Companies() {
  const { data, isLoading } = useQuery({ queryKey: ['admin', 'companies'], queryFn: () => api.get<CompanyRow[]>('/admin/companies') });
  return (
    <Table
      rowKey="id"
      loading={isLoading}
      dataSource={data}
      pagination={false}
      expandable={{ expandedRowRender: (c) => <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{c.vessels.map((v) => <Tag key={v.id} bordered={false} style={{ padding: '4px 10px', borderRadius: 999 }}>{v.name} · {v.vesselType}{v.imoNumber ? ` · ${v.imoNumber}` : ''}</Tag>)}</div>, defaultExpandAllRows: true }}
      columns={[
        { title: 'Компания', render: (_, c) => <b>{c.name}</b> },
        { title: 'ИНН', dataIndex: 'inn' },
        { title: 'Телефон', dataIndex: 'contactPhone' },
        { title: 'Судов', render: (_, c) => c.vessels.length },
        { title: 'Пользователей', dataIndex: 'usersCount' },
        { title: 'Заказов', dataIndex: 'ordersCount' },
      ]}
    />
  );
}

function Dictionaries({ isAdmin }: { isAdmin: boolean }) {
  const { data } = useDictionaries();
  const qc = useQueryClient();
  const { message } = App.useApp();
  const [name, setName] = useState<{ kind: 'vessel-types' | 'categories'; value: string } | null>(null);
  const add = async () => {
    if (!name?.value.trim()) return;
    try {
      await api.post(`/admin/${name.kind}`, { name: name.value.trim() });
      message.success('Добавлено в справочник');
      setName(null);
      qc.invalidateQueries({ queryKey: ['dictionaries'] });
    } catch (e) {
      message.error((e as ApiError).message);
    }
  };
  const block = (title: string, kind: 'vessel-types' | 'categories', items: { id: number; name: string; extra?: string }[]) => (
    <div className="card card-pad">
      <h3 style={{ marginTop: 0 }}>{title}</h3>
      <div className="chips">
        {items.map((i) => (
          <span key={i.id} className="pill" style={{ background: 'var(--primary-tint)', color: 'var(--primary-hover)' }}>
            {i.name} {i.extra && <span className="faint">{i.extra}</span>}
          </span>
        ))}
      </div>
      {isAdmin && (
        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <Input placeholder="Новое значение" value={name?.kind === kind ? name.value : ''} onChange={(e) => setName({ kind, value: e.target.value })} onPressEnter={add} />
          <Button icon={<PlusOutlined />} onClick={add} disabled={name?.kind !== kind}>
            Добавить
          </Button>
        </div>
      )}
    </div>
  );
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 20 }}>
      {block('Типы судов', 'vessel-types', data?.vesselTypes ?? [])}
      {block('Категории оборудования', 'categories', (data?.categories ?? []).map((c) => ({ ...c, extra: String(c.partsCount) })))}
    </div>
  );
}

function Notifications() {
  const { data, isLoading } = useQuery({ queryKey: ['admin', 'notifications'], queryFn: () => api.get<NotificationRow[]>('/admin/notifications?take=100'), refetchInterval: 15_000 });
  return (
    <>
      <p className="muted" style={{ marginTop: 0 }}>
        Интеграции: SMS через SMS.ru (REST API) и письма через SMTP. В демо-режиме сообщения не уходят наружу, а записываются сюда — со статусом «журнал».
      </p>
      <Table
        rowKey="id"
        size="middle"
        loading={isLoading}
        dataSource={data}
        pagination={{ pageSize: 15 }}
        columns={[
          { title: 'Когда', width: 150, render: (_, n) => fmtDateTime(n.at) },
          { title: 'Канал', width: 90, render: (_, n) => <Tag bordered={false} color={n.channel === 'SMS' ? 'cyan' : 'gold'}>{n.channel === 'SMS' ? 'SMS' : 'Почта'}</Tag> },
          { title: 'Кому', width: 200, dataIndex: 'recipient' },
          { title: 'Текст', render: (_, n) => <div>{n.subject && <b>{n.subject}<br /></b>}<span className="muted">{n.body}</span></div> },
          { title: 'Заказ', width: 130, render: (_, n) => n.orderNumber && <span className="mono">{n.orderNumber}</span> },
          { title: 'Статус', width: 140, render: (_, n) => <Tag bordered={false} color={n.status === 'SENT' ? 'green' : n.status === 'FAILED' ? 'red' : 'default'}>{n.status === 'SENT' ? 'отправлено' : n.status === 'FAILED' ? 'ошибка' : 'журнал'} · {n.provider}</Tag> },
        ]}
      />
    </>
  );
}

export default function AdminPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  return (
    <motion.div className="card card-pad" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease }}>
      {!isAdmin && <p className="faint" style={{ marginTop: 0 }}>Изменять данные может только администратор системы.</p>}
      <Tabs
        items={[
          { key: 'users', label: 'Пользователи', children: <Users isAdmin={isAdmin} /> },
          { key: 'companies', label: 'Компании и суда', children: <Companies /> },
          { key: 'dict', label: 'Справочники', children: <Dictionaries isAdmin={isAdmin} /> },
          { key: 'log', label: 'Журнал уведомлений', children: <Notifications /> },
        ]}
      />
    </motion.div>
  );
}
