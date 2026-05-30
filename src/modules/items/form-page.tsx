import { useEffect, useRef, useState } from 'react';
import {
  Button,
  Card,
  Form,
  Input,
  Message,
  Modal,
  Select,
  Space,
  Typography,
  Upload,
} from '@arco-design/web-react';
import { FormInstance } from '@arco-design/web-react/es/Form';
import type { UploadItem } from '@arco-design/web-react/es/Upload';
import { useHistory, useParams } from 'react-router-dom';
import AppPage from '@/components/AppPage';
import AppState from '@/components/AppState';
import SafeImage from '@/components/SafeImage';
import {
  createItem,
  fetchItem,
  generateItemDescription,
  ItemConditionGrade,
  ItemCreateRequest,
  ItemStatus,
  updateItem,
} from '@/services/items';
import { ITEM_CONDITION_OPTIONS } from './utils';
import styles from '../management.module.less';

const MAX_IMAGE_SIZE = 2 * 1024 * 1024;

function conditionLabel(condition: ItemConditionGrade) {
  return (
    ITEM_CONDITION_OPTIONS.find((item) => item.value === condition)?.label ||
    condition
  );
}

interface ItemFormPageProps {
  mode: 'create' | 'edit';
}

interface ItemFormValues {
  title: string;
  category: string;
  brand?: string;
  conditionGrade: ItemConditionGrade;
  status: ItemStatus;
  description?: string;
}

export default function ItemFormPage(props: ItemFormPageProps) {
  const { mode } = props;
  const history = useHistory();
  const { id } = useParams() as { id?: string };
  const formRef = useRef<FormInstance>();
  const [loading, setLoading] = useState(mode === 'edit');
  const [submitting, setSubmitting] = useState(false);
  const [optimizingDescription, setOptimizingDescription] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [imageFileList, setImageFileList] = useState<UploadItem[]>([]);
  const [currentImages, setCurrentImages] = useState<string[]>([]);
  const [previewImage, setPreviewImage] = useState('');
  const [initialValues, setInitialValues] = useState<Partial<ItemFormValues>>({
    conditionGrade: 'NEW',
    status: 'PENDING_AUDIT',
  });

  const isEdit = mode === 'edit';

  useEffect(() => {
    if (!isEdit || !id) {
      return;
    }

    async function loadItemDetail() {
      setLoading(true);
      setLoadError('');
      try {
        const result = await fetchItem(id);
        const nextValues: ItemFormValues = {
          title: result.title,
          category: result.category,
          brand: result.brand,
          conditionGrade: result.conditionGrade,
          status: result.status,
          description: result.description,
        };
        setInitialValues(nextValues);
        formRef.current?.setFieldsValue(nextValues);
        setCurrentImages(result.images || []);
      } catch (error) {
        setLoadError('商品详情加载失败，暂时无法展示已保存内容。');
      } finally {
        setLoading(false);
      }
    }

    loadItemDetail();
  }, [id, isEdit]);

  function buildPayload(values: ItemFormValues): ItemCreateRequest {
    const images = imageFileList
      .map((item) => item.originFile)
      .filter(Boolean) as File[];

    return {
      title: values.title.trim(),
      category: values.category.trim(),
      brand: values.brand?.trim() || undefined,
      conditionGrade: values.conditionGrade,
      status: 'PENDING_AUDIT',
      description: values.description?.trim() || undefined,
      images: images.length > 0 ? images : undefined,
    };
  }

  async function handleSubmit(values: ItemFormValues) {
    setSubmitting(true);
    try {
      const payload = buildPayload(values);
      const result =
        isEdit && id
          ? await updateItem(id, payload)
          : await createItem(payload);
      Message.success(isEdit ? '商品更新成功' : '商品创建成功');
      history.push(`/items/${result.id}`);
    } catch (error) {
      if (error instanceof Error) {
        Message.error(error.message);
      }
    } finally {
      setSubmitting(false);
    }
  }

  function resolveOptimizeImage() {
    const selectedImage = imageFileList.find((item) => item.originFile)
      ?.originFile as File | undefined;
    if (selectedImage) {
      return { image: selectedImage };
    }
    const currentImage = currentImages[0];
    if (!currentImage) {
      return undefined;
    }
    return { imageUrl: currentImage };
  }

  async function handleOptimizeDescription() {
    const values = (formRef.current?.getFieldsValue?.() ||
      {}) as Partial<ItemFormValues>;
    const title = values.title?.trim();
    const category = values.category?.trim();
    const condition = values.conditionGrade || 'NEW';
    if (!title || !category) {
      Message.warning('请先填写商品标题和类目。');
      return;
    }

    setOptimizingDescription(true);
    try {
      const imageInput = resolveOptimizeImage();
      if (!imageInput) {
        Message.warning('请先选择商品图片。');
        return;
      }
      const result = await generateItemDescription({
        ...imageInput,
        title,
        category,
        condition: conditionLabel(condition),
      });
      formRef.current?.setFieldsValue({
        title: result.title || title,
        category: result.category || category,
        description: result.description,
      });
      Message.success('商品描述已优化');
    } catch (error) {
      if (error instanceof Error) {
        Message.error(error.message);
      }
    } finally {
      setOptimizingDescription(false);
    }
  }

  if (loadError) {
    return (
      <AppPage title={isEdit ? '编辑商品' : '创建商品'}>
        <Card>
          <AppState
            status="500"
            title="商品信息加载失败"
            subtitle={loadError}
            actionText="返回列表"
            onAction={() => history.push('/items/list')}
          />
        </Card>
      </AppPage>
    );
  }

  return (
    <AppPage
      title={isEdit ? '编辑商品' : '创建商品'}
      extra={
        <Space>
          <Button onClick={() => history.push('/items/list')}>返回列表</Button>
          {isEdit && id ? (
            <Button onClick={() => history.push(`/items/${id}`)}>
              查看详情
            </Button>
          ) : null}
        </Space>
      }
    >
      <Card loading={loading}>
        {loading ? null : (
          <Form
            ref={formRef}
            layout="vertical"
            initialValues={initialValues}
            onSubmit={handleSubmit}
          >
            <Form.Item
              field="title"
              label="商品标题"
              rules={[
                { required: true, message: '请输入商品标题' },
                { maxLength: 80, message: '商品标题不能超过 80 个字符' },
              ]}
            >
              <Input placeholder="例如：限量版机械键盘" />
            </Form.Item>

            <Form.Item
              field="category"
              label="类目"
              rules={[
                { required: true, message: '请输入商品类目' },
                { maxLength: 40, message: '类目不能超过 40 个字符' },
              ]}
            >
              <Input placeholder="例如：数码配件" />
            </Form.Item>

            <Form.Item
              field="brand"
              label="品牌"
              rules={[{ maxLength: 40, message: '品牌不能超过 40 个字符' }]}
            >
              <Input allowClear placeholder="选填，例如：品牌名称" />
            </Form.Item>

            <Form.Item field="conditionGrade" label="成色">
              <Select options={ITEM_CONDITION_OPTIONS} />
            </Form.Item>

            <Form.Item
              label="商品图片"
              extra={
                isEdit
                  ? '选择新图片后会替换原图片；不选择则保留现有图片。单张不超过 2MB。'
                  : '选择图片文件后会随商品信息一起提交。单张不超过 2MB。'
              }
            >
              <Space direction="vertical" size={12} style={{ width: '100%' }}>
                {currentImages.length > 0 ? (
                  <div className={styles.imageGrid}>
                    {currentImages.map((image, index) => (
                      <button
                        type="button"
                        key={`${image}-${index}`}
                        className={styles.imagePreviewTrigger}
                        onClick={() => setPreviewImage(image)}
                      >
                        <SafeImage
                          src={image}
                          alt={`已上传图片 ${index + 1}`}
                          className={styles.galleryImage}
                        />
                      </button>
                    ))}
                  </div>
                ) : null}
                <Upload
                  multiple
                  accept="image/*"
                  autoUpload={false}
                  listType="picture-card"
                  fileList={imageFileList}
                  beforeUpload={(file) => {
                    if (file.size > MAX_IMAGE_SIZE) {
                      Message.error(
                        `图片 ${file.name} 超过 2MB 限制，请压缩后再上传`
                      );
                      return false;
                    }
                    return true;
                  }}
                  onChange={(nextFileList) =>
                    setImageFileList(
                      nextFileList.filter((item) => {
                        const size = item.originFile?.size;
                        return size === undefined || size <= MAX_IMAGE_SIZE;
                      })
                    )
                  }
                />
              </Space>
            </Form.Item>

            <Form.Item
              field="description"
              label={
                <Space size={8}>
                  <span>商品描述</span>
                  <Button
                    size="mini"
                    type="secondary"
                    htmlType="button"
                    loading={optimizingDescription}
                    onClick={handleOptimizeDescription}
                  >
                    AI 优化
                  </Button>
                </Space>
              }
              rules={[
                { maxLength: 500, message: '商品描述不能超过 500 个字符' },
              ]}
            >
              <Input.TextArea
                placeholder="补充成色、配件和瑕疵等描述信息"
                autoSize={{ minRows: 4, maxRows: 8 }}
              />
            </Form.Item>

            <Space direction="vertical" size={16} style={{ width: '100%' }}>
              <Typography.Text type="secondary">
                保存成功后会进入商品详情页，可继续创建或关联拍品。
              </Typography.Text>
              <Space>
                <Button type="primary" htmlType="submit" loading={submitting}>
                  {isEdit ? '保存商品' : '创建商品'}
                </Button>
                <Button onClick={() => history.push('/items/list')}>
                  取消
                </Button>
              </Space>
            </Space>
          </Form>
        )}
      </Card>
      <Modal
        title="图片预览"
        visible={Boolean(previewImage)}
        footer={null}
        onCancel={() => setPreviewImage('')}
      >
        <SafeImage
          src={previewImage}
          alt="商品图片预览"
          style={{ width: '100%', maxHeight: 560, objectFit: 'contain' }}
        />
      </Modal>
    </AppPage>
  );
}
