import { LogoutOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { ease, Logo } from './ui';

/**
 * Полный выход из аккаунта: токены и кэш данных стираются, сервер отзывает сессию,
 * затем — страница входа, где можно сразу войти под другим пользователем.
 */
export function LogoutButton({ variant = 'default' }: { variant?: 'default' | 'danger' | 'ghost' }) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [leaving, setLeaving] = useState(false);
  const firstName = user?.fullName.split(' ')[1] ?? '';

  const logout = async () => {
    if (leaving) return;
    setLeaving(true);
    await new Promise((r) => setTimeout(r, 900)); // даём проиграть анимацию прощания
    await signOut();
    navigate('/login', { replace: true });
  };

  return (
    <>
      <motion.div whileTap={{ scale: 0.94 }}>
        <Button
          icon={<LogoutOutlined />}
          onClick={logout}
          danger={variant === 'danger'}
          type={variant === 'ghost' ? 'text' : 'default'}
          loading={leaving}
          aria-label="Выйти из аккаунта"
        >
          <span className="logout-label">Выйти</span>
        </Button>
      </motion.div>
      {createPortal(
        <AnimatePresence>
          {leaving && (
            <motion.div
              className="logout-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.35, ease }}
            >
              <motion.div initial={{ scale: 0.6, rotate: -20 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 16 }}>
                <Logo size={72} />
              </motion.div>
              <motion.h2 initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15, duration: 0.4, ease }}>
                До свидания{firstName ? `, ${firstName}` : ''}!
              </motion.h2>
              <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}>
                Выходим из аккаунта…
              </motion.p>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}
