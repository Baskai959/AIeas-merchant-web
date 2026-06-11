import React from 'react';
import useLocale from '@/utils/useLocale';
import locale from './locale';
import LoginVisual from './assets/auction-control-room.png';
import Logo from '@/assets/logo.png';
import styles from './style/index.module.less';

export default function LoginBanner() {
  const t = useLocale(locale);
  const highlights = [
    t['login.banner.highlight1'],
    t['login.banner.highlight2'],
    t['login.banner.highlight3'],
  ];

  return (
    <div className={styles['visual-shell']}>
      <img
        alt={t['login.banner.imageAlt']}
        className={styles['visual-image']}
        src={LoginVisual}
      />
      <div className={styles['visual-vignette']} />
      <div className={styles['visual-content']}>
        <div className={styles.brand}>
          <img src={Logo} alt={t['login.brand.name']} />
          <span>{t['login.brand.name']}</span>
        </div>
        <div className={styles['visual-copy']}>
          <h1>{t['login.banner.title']}</h1>
          <p>{t['login.banner.description']}</p>
        </div>
        <div className={styles['visual-highlights']}>
          {highlights.map((item) => (
            <span key={item}>{item}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
