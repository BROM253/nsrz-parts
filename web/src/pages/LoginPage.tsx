import { ArrowLeftOutlined, MailOutlined, PhoneOutlined } from '@ant-design/icons';
import { App, Button, Input, QRCode, Segmented } from 'antd';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import type { Profile, Tokens } from '../api/types';
import { isStaff, useAuth } from '../auth';
import { ease, Logo, Waves } from '../components/ui';

interface CodeSent {
  channel: 'sms' | 'email';
  sentTo: string;
  expiresInSec: number;
  resendInSec: number;
  devCode?: string;
}

const DEMO = {
  owner: [
    { label: 'Черноморский флот', login: '+7 900 000-00-01' },
    { label: 'Азов-Транс', login: '+7 900 000-00-02' },
    { label: 'Рыбак Кубани (почта)', login: 'sergeeva@rybak-kuban.ru' },
  ],
  staff: [
    { label: 'Отдел продаж', login: 'prodazhi@nsrz.ru' },
    { label: 'Склад', login: 'sklad@nsrz.ru' },
    { label: 'Администратор', login: 'admin@nsrz.ru' },
  ],
};

function CodeInput({ onComplete, disabled }: { onComplete: (code: string) => void; disabled?: boolean }) {
  const [digits, setDigits] = useState(['', '', '', '']);
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => refs.current[0]?.focus(), []);

  const set = (i: number, v: string) => {
    const clean = v.replace(/\D/g, '');
    if (clean.length > 1) {
      // вставили код целиком
      const next = clean.slice(0, 4).split('');
      while (next.length < 4) next.push('');
      setDigits(next);
      if (next.every(Boolean)) onComplete(next.join(''));
      else refs.current[Math.min(clean.length, 3)]?.focus();
      return;
    }
    const next = [...digits];
    next[i] = clean;
    setDigits(next);
    if (clean && i < 3) refs.current[i + 1]?.focus();
    if (next.every(Boolean)) onComplete(next.join(''));
  };

  return (
    <div className="code-boxes">
      {digits.map((d, i) => (
        <motion.input
          key={i}
          ref={(el) => (refs.current[i] = el)}
          value={d}
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          maxLength={4}
          disabled={disabled}
          aria-label={`Цифра ${i + 1}`}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 * i, duration: 0.3, ease }}
          onChange={(e) => set(i, e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Backspace' && !digits[i] && i > 0) refs.current[i - 1]?.focus();
          }}
        />
      ))}
    </div>
  );
}

export default function LoginPage() {
  const { user, signIn } = useAuth();
  const { message } = App.useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const [mode, setMode] = useState<'owner' | 'staff'>('owner');
  const [login, setLogin] = useState('');
  const [sent, setSent] = useState<CodeSent | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [codeKey, setCodeKey] = useState(0);
  const [left, setLeft] = useState(0);

  useEffect(() => {
    if (!sent) return;
    setLeft(sent.resendInSec);
    const t = setInterval(() => setLeft((v) => Math.max(0, v - 1)), 1000);
    return () => clearInterval(t);
  }, [sent]);

  if (user) return <Navigate to={isStaff(user) ? '/panel' : (location.state as any)?.from ?? '/'} replace />;

  const requestCode = async (value = login) => {
    setError(null);
    setLoading(true);
    try {
      const res = await api.post<CodeSent>('/auth/request-code', { login: value });
      setLogin(value);
      setSent(res);
      setCodeKey((k) => k + 1);
    } catch (e) {
      setError((e as ApiError).message);
    } finally {
      setLoading(false);
    }
  };

  const verify = async (code: string) => {
    setError(null);
    setLoading(true);
    try {
      const res = await api.post<Tokens & { user: Profile }>('/auth/verify', { login, code });
      signIn({ accessToken: res.accessToken, refreshToken: res.refreshToken }, res.user);
      message.success(`Добро пожаловать, ${res.user.fullName.split(' ')[1] ?? res.user.fullName}!`);
      navigate(isStaff(res.user) ? '/panel' : '/', { replace: true });
    } catch (e) {
      setError((e as ApiError).message);
      setCodeKey((k) => k + 1);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-wrap">
      <div className="login-art">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontWeight: 700, fontSize: 18 }}>
          <Logo size={46} /> АО «НСРЗ»
        </div>
        <div style={{ position: 'relative', zIndex: 1 }}>
          <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease }}>
            Судовые запчасти со склада завода — за минуты, а не дни
          </motion.h1>
          <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.1, ease }}>
            Найдите деталь по номеру или названию, проверьте наличие на складе Новороссийского судоремонтного завода и отправьте заказ без писем и звонков.
          </motion.p>
        </div>
        <div className="login-qr" style={{ display: 'flex', alignItems: 'center', gap: 16, position: 'relative', zIndex: 1 }}>
          <div style={{ background: '#FFF7EF', padding: 8, borderRadius: 14 }}>
            <QRCode value={`${window.location.origin}/app`} size={112} bordered={false} color="#3A2A22" />
          </div>
          <div style={{ fontSize: 14, lineHeight: 1.5 }}>
            <b>Приложение на телефоне</b>
            <br />
            Наведите камеру — Android и iPhone.
            <br />
            <span style={{ opacity: 0.75 }}>Что видишь на складе — то и получишь</span>
          </div>
        </div>
        <Waves className="hero-waves" color="#FFE7D2" />
      </div>

      <div className="login-form">
        <motion.div className="card card-pad" style={{ width: '100%', maxWidth: 440, padding: 36 }} initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.4, ease }}>
          <AnimatePresence mode="wait" initial={false}>
            {!sent ? (
              <motion.div key="login" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.25, ease }}>
                <h2 style={{ margin: '0 0 6px', fontSize: 26, letterSpacing: '-0.02em' }}>Вход</h2>
                <p className="muted" style={{ marginTop: 0 }}>
                  {mode === 'owner' ? 'По номеру телефона или корпоративной почте — пришлём одноразовый код.' : 'Панель сотрудников НСРЗ: вход по рабочей почте.'}
                </p>
                <Segmented
                  block
                  value={mode}
                  onChange={(v) => setMode(v as 'owner' | 'staff')}
                  options={[
                    { label: 'Судовладелец', value: 'owner' },
                    { label: 'Сотрудник НСРЗ', value: 'staff' },
                  ]}
                  style={{ marginBottom: 18 }}
                />
                <Input
                  size="large"
                  autoFocus
                  prefix={mode === 'owner' ? <PhoneOutlined className="faint" /> : <MailOutlined className="faint" />}
                  placeholder={mode === 'owner' ? '+7 900 000-00-00 или почта' : 'name@nsrz.ru'}
                  value={login}
                  onChange={(e) => setLogin(e.target.value)}
                  onPressEnter={() => login && requestCode()}
                  status={error ? 'error' : undefined}
                />
                <AnimatePresence>
                  {error && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} style={{ color: 'var(--danger)', fontSize: 14, marginTop: 8 }}>
                      {error}
                    </motion.div>
                  )}
                </AnimatePresence>
                <Button type="primary" size="large" block loading={loading} disabled={!login.trim()} onClick={() => requestCode()} style={{ marginTop: 16 }}>
                  Получить код
                </Button>
                <div style={{ marginTop: 24 }}>
                  <div className="faint" style={{ fontSize: 13, marginBottom: 8 }}>
                    Демо-доступ для защиты проекта:
                  </div>
                  <div className="chips">
                    {DEMO[mode].map((d) => (
                      <button key={d.login} className="chip" style={{ minHeight: 34, padding: '5px 12px', fontSize: 13 }} onClick={() => requestCode(d.login)}>
                        {d.label}
                      </button>
                    ))}
                  </div>
                </div>
              </motion.div>
            ) : (
              <motion.div key="code" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} transition={{ duration: 0.25, ease }}>
                <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => setSent(null)} style={{ marginLeft: -12, marginBottom: 8 }}>
                  Другой номер
                </Button>
                <h2 style={{ margin: '0 0 6px', fontSize: 26, letterSpacing: '-0.02em' }}>Введите код</h2>
                <p className="muted" style={{ marginTop: 0 }}>
                  {sent.channel === 'sms' ? 'SMS' : 'Письмо'} с кодом отправлено на <b>{sent.sentTo}</b>
                </p>
                {sent.devCode && (
                  <motion.div className="demo-hint" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} style={{ marginBottom: 18 }}>
                    Демо-режим: код <b className="mono" style={{ fontSize: 16 }}>{sent.devCode}</b> (на реальном запуске он придёт только по {sent.channel === 'sms' ? 'SMS' : 'почте'})
                  </motion.div>
                )}
                <motion.div key={codeKey} animate={error ? { x: [0, -10, 10, -6, 6, 0] } : {}} transition={{ duration: 0.4 }}>
                  <CodeInput onComplete={verify} disabled={loading} />
                </motion.div>
                {error && <div style={{ color: 'var(--danger)', fontSize: 14, marginTop: 12, textAlign: 'center' }}>{error}</div>}
                <div style={{ textAlign: 'center', marginTop: 20 }}>
                  {left > 0 ? (
                    <span className="faint">Отправить код повторно через {left} с</span>
                  ) : (
                    <Button type="link" onClick={() => requestCode()} loading={loading}>
                      Отправить код ещё раз
                    </Button>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </div>
  );
}
