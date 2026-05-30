import { Trigger, Typography } from '@arco-design/web-react';
import { SketchPicker } from 'react-color';
import { generate, getRgbStr } from '@arco-design/color';
import useLocale from '@/utils/useLocale';
import styles from './style/color-panel.module.less';
import { useSettingsStore } from '@/store';

function ColorPanel() {
  const theme =
    document.querySelector('body').getAttribute('arco-theme') || 'light';
  const settings = useSettingsStore((state) => state.settings);
  const updateSettings = useSettingsStore((state) => state.updateSettings);
  const locale = useLocale();
  const themeColor = settings.themeColor;
  const list = generate(themeColor, { list: true });

  return (
    <div>
      <Trigger
        trigger="hover"
        position="bl"
        popup={() => (
          <SketchPicker
            color={themeColor}
            onChangeComplete={(color: any) => {
              const newColor = color.hex;
              updateSettings({ themeColor: newColor });
              const newList = generate(newColor, {
                list: true,
                dark: theme === 'dark',
              });
              newList.forEach((l: string, index: number) => {
                const rgbStr = getRgbStr(l);
                document.body.style.setProperty(
                  `--arcoblue-${index + 1}`,
                  rgbStr
                );
              });
            }}
          />
        )}
      >
        <div className={styles.input}>
          <div
            className={styles.color}
            style={{ backgroundColor: themeColor }}
          />
          <span>{themeColor}</span>
        </div>
      </Trigger>
      <ul className={styles.ul}>
        {list.map((item: string, index: number) => (
          <li
            key={index}
            className={styles.li}
            style={{ backgroundColor: item }}
          />
        ))}
      </ul>
      <Typography.Paragraph style={{ fontSize: 12 }}>
        {locale['settings.color.tooltip']}
      </Typography.Paragraph>
    </div>
  );
}

export default ColorPanel;
