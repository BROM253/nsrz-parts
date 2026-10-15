import { LogoutOutlined } from '@ant-design/icons';
import { Avatar, Button } from 'antd';
import { motion } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth';
import { CategoryIcon, ease, itemVariants, listVariants } from '../../components/ui';
import { ROLE_TITLES } from '../../format';

export default function ProfilePage() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  if (!user) return null;
  return (
    <div style={{ maxWidth: 860 }}>
      <h1 className="section-title">Профиль и суда</h1>
      <motion.div className="card card-pad" style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap', marginTop: 16 }} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease }}>
        <Avatar size={72} style={{ background: '#F6E3D6', color: '#9C4422', fontSize: 26, fontWeight: 700 }}>
          {user.fullName.split(' ').slice(0, 2).map((p) => p[0]).join('')}
        </Avatar>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{user.fullName}</div>
          <div className="muted">
            {ROLE_TITLES[user.role]} · {user.company?.name}
          </div>
          <div className="faint" style={{ fontSize: 14 }}>
            {[user.phoneFormatted, user.email].filter(Boolean).join(' · ')}
          </div>
        </div>
        <Button danger icon={<LogoutOutlined />} onClick={() => signOut().then(() => navigate('/login'))}>
          Выйти
        </Button>
      </motion.div>

      <h3 style={{ marginTop: 28 }}>Суда компании</h3>
      <motion.div variants={listVariants} initial="hidden" animate="show" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
        {user.vessels.map((v) => (
          <motion.div key={v.id} variants={itemVariants} className="card card-pad" style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
            <CategoryIcon icon="deck" />
            <div>
              <b>{v.name}</b>
              <div className="muted" style={{ fontSize: 13.5 }}>
                {v.vesselType.name}
                {v.imoNumber ? ` · ${v.imoNumber}` : ''}
              </div>
            </div>
          </motion.div>
        ))}
      </motion.div>
      <p className="faint" style={{ marginTop: 20, fontSize: 13.5 }}>
        Чтобы добавить судно или сотрудника, напишите в отдел продаж НСРЗ — администратор подключит их в системе.
      </p>
    </div>
  );
}
