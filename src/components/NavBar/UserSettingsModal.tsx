import React, { useEffect, useMemo, useState } from 'react';
import {
  Avatar,
  Button,
  Cascader,
  Form,
  Input,
  Message,
  Modal,
  Space,
  Upload,
} from '@arco-design/web-react';
import { IconUpload, IconUser } from '@arco-design/web-react/icon';
import type { SessionUser } from '@/services/http/storage';
import {
  updateCurrentUserProfile,
  uploadCurrentUserAvatar,
} from '@/services/auth';
import styles from './style/index.module.less';

interface UserSettingsModalProps {
  visible: boolean;
  user?: SessionUser;
  onCancel: () => void;
  onUpdated: (user: SessionUser) => void;
}

interface ProfileFormValues {
  nickname: string;
  location?: string[];
}

const MAX_AVATAR_SIZE = 10 * 1024 * 1024;
const LOCATION_SEPARATOR = ' / ';

const REGION_OPTIONS = [
  {
    value: '北京市',
    label: '北京市',
    children: [
      {
        value: '北京市',
        label: '北京市',
        children: [
          { value: '东城区', label: '东城区' },
          { value: '西城区', label: '西城区' },
          { value: '朝阳区', label: '朝阳区' },
          { value: '海淀区', label: '海淀区' },
        ],
      },
    ],
  },
  {
    value: '上海市',
    label: '上海市',
    children: [
      {
        value: '上海市',
        label: '上海市',
        children: [
          { value: '黄浦区', label: '黄浦区' },
          { value: '徐汇区', label: '徐汇区' },
          { value: '浦东新区', label: '浦东新区' },
          { value: '静安区', label: '静安区' },
        ],
      },
    ],
  },
  {
    value: '广东省',
    label: '广东省',
    children: [
      {
        value: '广州市',
        label: '广州市',
        children: [
          { value: '天河区', label: '天河区' },
          { value: '越秀区', label: '越秀区' },
          { value: '海珠区', label: '海珠区' },
        ],
      },
      {
        value: '深圳市',
        label: '深圳市',
        children: [
          { value: '南山区', label: '南山区' },
          { value: '福田区', label: '福田区' },
          { value: '宝安区', label: '宝安区' },
        ],
      },
    ],
  },
  {
    value: '浙江省',
    label: '浙江省',
    children: [
      {
        value: '杭州市',
        label: '杭州市',
        children: [
          { value: '西湖区', label: '西湖区' },
          { value: '上城区', label: '上城区' },
          { value: '滨江区', label: '滨江区' },
        ],
      },
      {
        value: '宁波市',
        label: '宁波市',
        children: [
          { value: '海曙区', label: '海曙区' },
          { value: '鄞州区', label: '鄞州区' },
          { value: '江北区', label: '江北区' },
        ],
      },
    ],
  },
  {
    value: '江苏省',
    label: '江苏省',
    children: [
      {
        value: '南京市',
        label: '南京市',
        children: [
          { value: '玄武区', label: '玄武区' },
          { value: '秦淮区', label: '秦淮区' },
          { value: '建邺区', label: '建邺区' },
        ],
      },
      {
        value: '苏州市',
        label: '苏州市',
        children: [
          { value: '姑苏区', label: '姑苏区' },
          { value: '工业园区', label: '工业园区' },
          { value: '吴中区', label: '吴中区' },
        ],
      },
    ],
  },
  {
    value: '四川省',
    label: '四川省',
    children: [
      {
        value: '成都市',
        label: '成都市',
        children: [
          { value: '锦江区', label: '锦江区' },
          { value: '武侯区', label: '武侯区' },
          { value: '高新区', label: '高新区' },
        ],
      },
    ],
  },
  {
    value: '天津市',
    label: '天津市',
    children: [{ value: '天津市', label: '天津市' }],
  },
  {
    value: '重庆市',
    label: '重庆市',
    children: [{ value: '重庆市', label: '重庆市' }],
  },
  {
    value: '河北省',
    label: '河北省',
    children: [
      { value: '石家庄市', label: '石家庄市' },
      { value: '唐山市', label: '唐山市' },
      { value: '保定市', label: '保定市' },
      { value: '廊坊市', label: '廊坊市' },
    ],
  },
  {
    value: '山西省',
    label: '山西省',
    children: [
      { value: '太原市', label: '太原市' },
      { value: '大同市', label: '大同市' },
      { value: '晋中市', label: '晋中市' },
    ],
  },
  {
    value: '辽宁省',
    label: '辽宁省',
    children: [
      { value: '沈阳市', label: '沈阳市' },
      { value: '大连市', label: '大连市' },
      { value: '鞍山市', label: '鞍山市' },
    ],
  },
  {
    value: '吉林省',
    label: '吉林省',
    children: [
      { value: '长春市', label: '长春市' },
      { value: '吉林市', label: '吉林市' },
    ],
  },
  {
    value: '黑龙江省',
    label: '黑龙江省',
    children: [
      { value: '哈尔滨市', label: '哈尔滨市' },
      { value: '齐齐哈尔市', label: '齐齐哈尔市' },
      { value: '大庆市', label: '大庆市' },
    ],
  },
  {
    value: '安徽省',
    label: '安徽省',
    children: [
      { value: '合肥市', label: '合肥市' },
      { value: '芜湖市', label: '芜湖市' },
      { value: '黄山市', label: '黄山市' },
    ],
  },
  {
    value: '福建省',
    label: '福建省',
    children: [
      { value: '福州市', label: '福州市' },
      { value: '厦门市', label: '厦门市' },
      { value: '泉州市', label: '泉州市' },
    ],
  },
  {
    value: '江西省',
    label: '江西省',
    children: [
      { value: '南昌市', label: '南昌市' },
      { value: '赣州市', label: '赣州市' },
      { value: '九江市', label: '九江市' },
    ],
  },
  {
    value: '山东省',
    label: '山东省',
    children: [
      { value: '济南市', label: '济南市' },
      { value: '青岛市', label: '青岛市' },
      { value: '烟台市', label: '烟台市' },
    ],
  },
  {
    value: '河南省',
    label: '河南省',
    children: [
      { value: '郑州市', label: '郑州市' },
      { value: '洛阳市', label: '洛阳市' },
      { value: '开封市', label: '开封市' },
    ],
  },
  {
    value: '湖北省',
    label: '湖北省',
    children: [
      { value: '武汉市', label: '武汉市' },
      { value: '宜昌市', label: '宜昌市' },
      { value: '襄阳市', label: '襄阳市' },
    ],
  },
  {
    value: '湖南省',
    label: '湖南省',
    children: [
      { value: '长沙市', label: '长沙市' },
      { value: '株洲市', label: '株洲市' },
      { value: '岳阳市', label: '岳阳市' },
    ],
  },
  {
    value: '海南省',
    label: '海南省',
    children: [
      { value: '海口市', label: '海口市' },
      { value: '三亚市', label: '三亚市' },
    ],
  },
  {
    value: '贵州省',
    label: '贵州省',
    children: [
      { value: '贵阳市', label: '贵阳市' },
      { value: '遵义市', label: '遵义市' },
    ],
  },
  {
    value: '云南省',
    label: '云南省',
    children: [
      { value: '昆明市', label: '昆明市' },
      { value: '大理白族自治州', label: '大理白族自治州' },
      { value: '丽江市', label: '丽江市' },
    ],
  },
  {
    value: '陕西省',
    label: '陕西省',
    children: [
      { value: '西安市', label: '西安市' },
      { value: '咸阳市', label: '咸阳市' },
      { value: '宝鸡市', label: '宝鸡市' },
    ],
  },
  {
    value: '甘肃省',
    label: '甘肃省',
    children: [
      { value: '兰州市', label: '兰州市' },
      { value: '天水市', label: '天水市' },
    ],
  },
  {
    value: '青海省',
    label: '青海省',
    children: [{ value: '西宁市', label: '西宁市' }],
  },
  {
    value: '台湾省',
    label: '台湾省',
    children: [
      { value: '台北市', label: '台北市' },
      { value: '高雄市', label: '高雄市' },
    ],
  },
  {
    value: '内蒙古自治区',
    label: '内蒙古自治区',
    children: [
      { value: '呼和浩特市', label: '呼和浩特市' },
      { value: '包头市', label: '包头市' },
    ],
  },
  {
    value: '广西壮族自治区',
    label: '广西壮族自治区',
    children: [
      { value: '南宁市', label: '南宁市' },
      { value: '桂林市', label: '桂林市' },
    ],
  },
  {
    value: '西藏自治区',
    label: '西藏自治区',
    children: [{ value: '拉萨市', label: '拉萨市' }],
  },
  {
    value: '宁夏回族自治区',
    label: '宁夏回族自治区',
    children: [{ value: '银川市', label: '银川市' }],
  },
  {
    value: '新疆维吾尔自治区',
    label: '新疆维吾尔自治区',
    children: [
      { value: '乌鲁木齐市', label: '乌鲁木齐市' },
      { value: '喀什地区', label: '喀什地区' },
    ],
  },
  {
    value: '香港特别行政区',
    label: '香港特别行政区',
    children: [{ value: '香港特别行政区', label: '香港特别行政区' }],
  },
  {
    value: '澳门特别行政区',
    label: '澳门特别行政区',
    children: [{ value: '澳门特别行政区', label: '澳门特别行政区' }],
  },
];

function trimFormValue(value?: string) {
  return (value || '').trim();
}

function parseLocationValue(location?: string) {
  return trimFormValue(location)
    .split(LOCATION_SEPARATOR)
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatLocationValue(location?: string[]) {
  return (location || [])
    .map((item) => item.trim())
    .filter(Boolean)
    .join(LOCATION_SEPARATOR);
}

function UserSettingsModal(props: UserSettingsModalProps) {
  const { visible, user, onCancel, onUpdated } = props;
  const [form] = Form.useForm<ProfileFormValues>();
  const [saving, setSaving] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const avatarUrl = user?.avatarUrl || user?.avatar || '';

  const initialValues = useMemo(
    () => ({
      nickname: user?.nickname || '',
      location: parseLocationValue(user?.location),
    }),
    [user?.nickname, user?.location]
  );

  useEffect(() => {
    if (visible) {
      form.setFieldsValue(initialValues);
    }
  }, [form, initialValues, visible]);

  async function handleSave() {
    try {
      const values = await form.validate();
      setSaving(true);
      const updated = await updateCurrentUserProfile({
        nickname: trimFormValue(values.nickname),
        location: formatLocationValue(values.location),
      });
      onUpdated(updated);
      Message.success('商家资料已保存');
      onCancel();
    } finally {
      setSaving(false);
    }
  }

  async function handleAvatarUpload(file?: File) {
    if (!file) {
      return;
    }
    if (!file.type.startsWith('image/')) {
      Message.error('请选择图片文件');
      return;
    }
    if (file.size > MAX_AVATAR_SIZE) {
      Message.error('头像图片不能超过 10MB');
      return;
    }
    setAvatarUploading(true);
    try {
      const updated = await uploadCurrentUserAvatar(file);
      onUpdated(updated);
      Message.success('商家头像已更新');
    } finally {
      setAvatarUploading(false);
    }
  }

  return (
    <Modal
      title="用户设置"
      visible={visible}
      onCancel={onCancel}
      onOk={handleSave}
      confirmLoading={saving}
      okText="保存"
      cancelText="取消"
      unmountOnExit
    >
      <div className={styles.profileSettings}>
        <Space size={16} align="center">
          <Avatar size={64}>
            {avatarUrl ? (
              <img src={avatarUrl} alt={user?.nickname || '商家头像'} />
            ) : (
              user?.nickname?.slice(0, 1) || <IconUser />
            )}
          </Avatar>
          <Upload
            autoUpload={false}
            showUploadList={false}
            accept="image/*"
            disabled={avatarUploading}
            beforeUpload={(file) => {
              void handleAvatarUpload(file);
              return false;
            }}
          >
            <Button icon={<IconUpload />} loading={avatarUploading}>
              上传头像
            </Button>
          </Upload>
        </Space>
        <Form form={form} layout="vertical" className={styles.profileForm}>
          <Form.Item
            field="nickname"
            label="商家名称"
            rules={[
              { required: true, message: '请输入商家名称' },
              { maxLength: 64, message: '商家名称不能超过 64 个字符' },
            ]}
          >
            <Input placeholder="请输入商家名称" allowClear />
          </Form.Item>
          <Form.Item
            field="location"
            label="所在地"
          >
            <Cascader
              allowClear
              changeOnSelect
              options={REGION_OPTIONS}
              placeholder="请选择省 / 市 / 区"
              showSearch
            />
          </Form.Item>
        </Form>
      </div>
    </Modal>
  );
}

export default UserSettingsModal;
