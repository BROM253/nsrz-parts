import { AndroidFilled, AppleFilled, DownloadOutlined, LinkOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import { motion } from 'motion/react';
import { ease, Logo } from '../components/ui';

/**
 * Страница для телефона (открывается по QR-коду со страницы входа):
 * Android — скачать APK и одной кнопкой подключить приложение к этому серверу;
 * iPhone — открыть веб-версию приложения и добавить её на экран «Домой».
 */
export default function AppPage() {
  const origin = window.location.origin;
  const ua = navigator.userAgent;
  const isIos = /iPhone|iPad|iPod/i.test(ua);
  const isAndroid = /Android/i.test(ua);
  const connect = `nsrz://app/connect?server=${encodeURIComponent(origin)}`;

  const block = (delay: number, children: React.ReactNode) => (
    <motion.div className="card card-pad" style={{ marginTop: 16 }} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay, duration: 0.4, ease }}>
      {children}
    </motion.div>
  );

  const android = block(
    0.1,
    <>
      <h2 style={{ marginTop: 0 }}>
        <AndroidFilled style={{ color: '#4E7D3A' }} /> Android
      </h2>
      <p className="muted">1. Скачайте и установите приложение (разрешите установку из этого источника, если телефон спросит).</p>
      <a href="/download/nsrz-parts.apk">
        <Button type="primary" size="large" block icon={<DownloadOutlined />}>
          Скачать APK · 19 МБ
        </Button>
      </a>
      <div style={{ textAlign: 'center', marginTop: 6 }}>
        <a href="/download/nsrz-parts-armv7.apk" className="faint" style={{ fontSize: 13 }}>
          Телефон старше 2017 года? Версия для 32-битных процессоров
        </a>
      </div>
      <p className="muted" style={{ marginTop: 16 }}>
        2. Подключите приложение к этому серверу — адрес подставится сам.
      </p>
      <a href={connect}>
        <Button size="large" block icon={<LinkOutlined />}>
          Открыть в приложении
        </Button>
      </a>
    </>,
  );

  const ios = block(
    0.2,
    <>
      <h2 style={{ marginTop: 0 }}>
        <AppleFilled /> iPhone
      </h2>
      <p className="muted">Откройте приложение в Safari и добавьте его на экран «Домой»: кнопка «Поделиться» → «На экран Домой». Дальше оно запускается как обычное приложение — с иконкой и на весь экран.</p>
      <a href="/m/">
        <Button type="primary" size="large" block>
          Открыть приложение
        </Button>
      </a>
    </>,
  );

  return (
    <div style={{ minHeight: '100vh', padding: '28px 16px 48px', maxWidth: 520, margin: '0 auto' }}>
      <motion.div style={{ display: 'flex', gap: 14, alignItems: 'center' }} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <Logo size={52} />
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em' }}>НСРЗ · Запчасти</div>
          <div className="muted">Мобильное приложение судовладельца</div>
        </div>
      </motion.div>
      {isIos ? (
        <>
          {ios}
          {android}
        </>
      ) : (
        <>
          {android}
          {ios}
        </>
      )}
      {!isIos && !isAndroid && (
        <p className="faint" style={{ marginTop: 20, textAlign: 'center' }}>
          Эту страницу удобнее открыть на телефоне — отсканируйте QR-код на странице входа.
        </p>
      )}
      <p className="faint" style={{ marginTop: 20, fontSize: 13, textAlign: 'center' }}>
        Адрес сервера: {origin}
      </p>
    </div>
  );
}
