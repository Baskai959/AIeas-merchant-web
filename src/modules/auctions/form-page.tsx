import React, { useEffect, useRef, useState } from 'react';
import {
  Button,
  Card,
  Form,
  Grid,
  Input,
  InputNumber,
  Spin,
  Message,
  Select,
  Space,
  Typography,
  Upload,
} from '@arco-design/web-react';
import type { UploadItem } from '@arco-design/web-react/es/Upload';
import {
  IconDelete,
  IconImage,
  IconPlus,
  IconStar,
  IconUpload,
} from '@arco-design/web-react/icon';
import { useHistory, useParams } from 'react-router-dom';
import AppPage from '@/components/AppPage';
import SafeImage from '@/components/SafeImage';
import {
  AuctionAntiExtendMode,
  AuctionCreateRequest,
  AuctionIncrementRule,
  AuctionLot,
  LotCondition,
  WritableAuctionStatus,
  createAuction,
  fetchAuction,
  listAuctionCategories,
  optimizeLotDescription,
  updateAuction,
  uploadAuctionImages,
} from '@/services/auctions';
import {
  AUCTION_CATEGORY_OPTIONS,
  AuctionCategoryOption,
  centToYuan,
  normalizeAuctionCategory,
  renderAuctionStatusTag,
  yuanToCent,
} from './utils';
import styles from '../management.module.less';

interface AuctionFormPageProps {
  mode: 'create' | 'edit';
}

interface AuctionFormValues {
  title: string;
  subtitle?: string;
  description?: string;
  category: string;
  brand?: string;
  condition: LotCondition;
  startPrice: number;
  reservePrice?: number;
  capPrice?: number;
  incrementAmount: number;
  maxBidSteps: number;
  antiSnipingSec: number;
  antiExtendSec: number;
  antiExtendMode: AuctionAntiExtendMode;
  depositAmount: number;
  durationSec?: number;
}

type IncrementRuleType = 'fixed' | 'ladder';

interface LadderStepForm {
  min?: number;
  max?: number;
  amount?: number;
}

const Row = Grid.Row;
const Col = Grid.Col;

const CONDITION_OPTIONS = [
  { label: '全新', value: 'NEW' },
  { label: '几乎全新', value: 'LIKE_NEW' },
  { label: '良好', value: 'GOOD' },
  { label: '一般', value: 'FAIR' },
];

const ANTI_EXTEND_MODE_OPTIONS = [
  { label: '增加时长', value: 'ADD' },
  { label: '重置倒计时', value: 'RESET' },
];

const INCREMENT_RULE_TYPE_OPTIONS = [
  { label: '固定加价', value: 'fixed' },
  { label: '阶梯加价', value: 'ladder' },
];

const DEFAULT_LADDER_PRICE_RANGE = 100;
const MIN_PRICE_INCREMENT = 0.01;
const MAX_AUCTION_IMAGE_SIZE = 5 * 1024 * 1024;
const MAX_AUCTION_IMAGE_UPLOAD_TOTAL_SIZE = 20 * 1024 * 1024;
const RESET_ANTI_EXTEND_ERROR =
  '重置倒计时时，延长/重置时长必须大于等于反狙击窗口。';

function formatUploadSize(size: number) {
  if (size >= 1024 * 1024) {
    return `${Math.round((size / 1024 / 1024) * 10) / 10}MB`;
  }
  return `${Math.ceil(size / 1024)}KB`;
}

function normalizeImageURLs(urls: Array<string | undefined>) {
  return Array.from(
    new Set(
      urls
        .map((url) => url?.trim())
        .filter((url): url is string => Boolean(url))
    )
  );
}

function mergeImageURLs(urls: string[], coverUrl?: string) {
  return normalizeImageURLs([...urls, coverUrl]);
}

function uniqueUploadedURLs(urls: string[]) {
  return normalizeImageURLs(urls);
}

function getUploadFiles(uploadItems: UploadItem[]) {
  return uploadItems
    .map((item) => item.originFile)
    .filter((file): file is File => Boolean(file));
}

function toOptionalNumber(value: unknown) {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) ? parsedValue : undefined;
}

function normalizePrice(value: unknown, fallback = 0) {
  const parsedValue = toOptionalNumber(value);
  return parsedValue === undefined ? fallback : parsedValue;
}

function getConfiguredCapPrice(value: unknown) {
  const parsedValue = toOptionalNumber(value);
  return parsedValue !== undefined && parsedValue > 0 ? parsedValue : undefined;
}

function getDefaultLadderMax(min: number) {
  return Number((min + DEFAULT_LADDER_PRICE_RANGE).toFixed(2));
}

function getMinStepMax(min?: number) {
  return Number((normalizePrice(min) + MIN_PRICE_INCREMENT).toFixed(2));
}

function createDefaultLadderSteps(
  startPrice = 0,
  capPrice?: number
): LadderStepForm[] {
  const firstMin = normalizePrice(startPrice);
  const firstMax = getDefaultLadderMax(firstMin);
  return [
    { min: firstMin, max: firstMax, amount: 1 },
    { min: firstMax, max: getConfiguredCapPrice(capPrice), amount: 5 },
  ];
}

function normalizeLadderStepsWithPriceBounds(
  steps: LadderStepForm[],
  startPrice?: number,
  capPrice?: number
): LadderStepForm[] {
  const configuredCapPrice = getConfiguredCapPrice(capPrice);
  const baseSteps = steps.length
    ? steps.map((step) => ({ ...step }))
    : createDefaultLadderSteps(startPrice, configuredCapPrice);
  let nextMin = normalizePrice(startPrice);

  return baseSteps.map((step, index) => {
    const isLastStep = index === baseSteps.length - 1;
    const normalizedStep: LadderStepForm = {
      ...step,
      min: nextMin,
    };

    if (isLastStep) {
      normalizedStep.max = configuredCapPrice;
      return normalizedStep;
    }

    const stepMax = toOptionalNumber(step.max);
    normalizedStep.max =
      stepMax !== undefined && stepMax > nextMin
        ? stepMax
        : getDefaultLadderMax(nextMin);
    nextMin = normalizedStep.max;
    return normalizedStep;
  });
}

function buildLadderStepsPayload(
  steps: LadderStepForm[],
  startPrice?: number,
  capPrice?: number
) {
  if (steps.length === 0) {
    throw new Error('请至少配置一个阶梯加价档位。');
  }
  let previousMax: number | undefined;
  const expectedFirstMin = yuanToCent(normalizePrice(startPrice));
  const expectedLastMax = yuanToCent(getConfiguredCapPrice(capPrice));
  return steps.map((step, index) => {
    const min = yuanToCent(toOptionalNumber(step.min));
    const max = yuanToCent(toOptionalNumber(step.max));
    const amount = yuanToCent(toOptionalNumber(step.amount));
    const isLastStep = index === steps.length - 1;

    if (min === undefined || min < 0) {
      throw new Error(`第 ${index + 1} 档起始价不能为空，且不能小于 0。`);
    }
    if (index === 0 && min !== expectedFirstMin) {
      throw new Error('阶梯加价第一档起始价必须与起拍价一致。');
    }
    if (index > 0 && previousMax !== undefined && min !== previousMax) {
      throw new Error(`第 ${index + 1} 档起始价必须等于上一档结束价。`);
    }
    if (!amount || amount < 1) {
      throw new Error(`第 ${index + 1} 档加价金额必须大于 0。`);
    }
    if (isLastStep) {
      if (expectedLastMax === undefined) {
        if (max !== undefined) {
          throw new Error('未设置落锤价时，阶梯加价最后一档不能设置结束价。');
        }
        return { min, amount };
      }
      if (max === undefined || max !== expectedLastMax) {
        throw new Error(
          '已设置落锤价时，阶梯加价最后一档结束价必须与落锤价一致。'
        );
      }
      if (max <= min) {
        throw new Error(`第 ${index + 1} 档结束价必须大于起始价。`);
      }
      return { min, max, amount };
    }
    if (max === undefined) {
      throw new Error(`第 ${index + 1} 档结束价不能为空。`);
    }
    if (max <= min) {
      throw new Error(`第 ${index + 1} 档结束价必须大于起始价。`);
    }
    previousMax = max;
    return { min, max, amount };
  });
}

function buildIncrementRule(
  values: AuctionFormValues,
  incrementRuleType: IncrementRuleType,
  ladderSteps: LadderStepForm[]
): AuctionIncrementRule {
  const maxBidSteps = Number(values.maxBidSteps || 1);
  if (!Number.isInteger(maxBidSteps) || maxBidSteps < 1) {
    throw new Error('单次最多加价步数必须为大于 0 的整数。');
  }
  if (incrementRuleType === 'ladder') {
    return {
      type: 'ladder',
      maxBidSteps,
      steps: buildLadderStepsPayload(
        ladderSteps,
        values.startPrice,
        values.capPrice
      ),
    };
  }
  const amount = yuanToCent(values.incrementAmount);
  if (!amount || amount < 1) {
    throw new Error('固定加价幅度必须大于 0。');
  }
  return { type: 'fixed', amount, maxBidSteps };
}

function getAntiExtendValidationMessage(
  antiSnipingSec?: number,
  antiExtendSec?: number,
  antiExtendMode?: AuctionAntiExtendMode
) {
  const normalizedAntiSnipingSec = antiSnipingSec || 15;
  const normalizedAntiExtendSec = antiExtendSec || 30;
  const normalizedAntiExtendMode = antiExtendMode || 'ADD';
  if (
    normalizedAntiExtendMode === 'RESET' &&
    normalizedAntiExtendSec < normalizedAntiSnipingSec
  ) {
    return RESET_ANTI_EXTEND_ERROR;
  }
  return undefined;
}

function valuesToPayload(
  values: AuctionFormValues,
  imageURLs: string[],
  coverURL: string | undefined,
  incrementRuleType: IncrementRuleType,
  ladderSteps: LadderStepForm[],
  categoryOptions: AuctionCategoryOption[]
): AuctionCreateRequest {
  const imageUrls = mergeImageURLs(imageURLs, coverURL);
  const normalizedCoverURL = coverURL?.trim() || imageUrls[0];
  const category = normalizeAuctionCategory(values.category, categoryOptions);
  if (!values.title?.trim() || !category || !values.condition) {
    throw new Error('请填写标题、类目和成色。');
  }
  if (!values.description?.trim() && imageUrls.length === 0) {
    throw new Error('请至少填写描述或拍品图片。');
  }
  const antiExtendValidationMessage = getAntiExtendValidationMessage(
    values.antiSnipingSec,
    values.antiExtendSec,
    values.antiExtendMode
  );
  if (antiExtendValidationMessage) {
    throw new Error(antiExtendValidationMessage);
  }
  return {
    title: values.title.trim(),
    subtitle: values.subtitle?.trim(),
    description: values.description?.trim(),
    category,
    brand: values.brand?.trim(),
    condition: values.condition,
    imageUrls,
    coverUrl: normalizedCoverURL,
    auctionType: 'ENGLISH',
    startPrice: yuanToCent(values.startPrice) ?? 0,
    reservePrice: yuanToCent(values.reservePrice) ?? 0,
    capPrice: yuanToCent(values.capPrice) ?? 0,
    incrementRule: buildIncrementRule(values, incrementRuleType, ladderSteps),
    antiSnipingSec: values.antiSnipingSec || 15,
    antiExtendSec: values.antiExtendSec || 30,
    antiExtendMode: values.antiExtendMode || 'ADD',
    depositAmount: yuanToCent(values.depositAmount) ?? 0,
    durationSec: values.durationSec || undefined,
  };
}

function auctionToFormValues(
  auction: AuctionLot,
  categoryOptions: AuctionCategoryOption[]
): AuctionFormValues {
  const rule = auction.incrementRule;
  return {
    title: auction.title,
    subtitle: auction.subtitle,
    description: auction.description,
    category: normalizeAuctionCategory(auction.category, categoryOptions),
    brand: auction.brand,
    condition: auction.condition || 'GOOD',
    startPrice: centToYuan(auction.startPrice) || 0,
    reservePrice: centToYuan(auction.reservePrice || 0),
    capPrice: centToYuan(auction.capPrice || 0),
    incrementAmount:
      rule?.type === 'fixed' ? centToYuan(rule.amount || 100) || 1 : 1,
    maxBidSteps: rule?.maxBidSteps || 1,
    antiSnipingSec: auction.antiSnipingSec || 15,
    antiExtendSec: auction.antiExtendSec || 30,
    antiExtendMode: auction.antiExtendMode || 'ADD',
    depositAmount: centToYuan(auction.depositAmount) || 0,
    durationSec: auction.durationSec || undefined,
  };
}

function auctionToLadderSteps(
  auction: AuctionLot,
  startPrice: number,
  capPrice?: number
): LadderStepForm[] {
  const rule = auction.incrementRule;
  if (rule?.type !== 'ladder' || !Array.isArray(rule.steps)) {
    return createDefaultLadderSteps(startPrice, capPrice);
  }
  return normalizeLadderStepsWithPriceBounds(
    rule.steps.map((step) => ({
      min: centToYuan(step.min) || 0,
      max: step.max !== undefined ? centToYuan(step.max) : undefined,
      amount: centToYuan(step.amount) || 1,
    })),
    startPrice,
    capPrice
  );
}

export default function AuctionFormPage({ mode }: AuctionFormPageProps) {
  const [form] = Form.useForm<AuctionFormValues>();
  const history = useHistory();
  const params = useParams() as { id?: string };
  const [loading, setLoading] = useState(mode === 'edit');
  const [saving, setSaving] = useState<WritableAuctionStatus | null>(null);
  const [auction, setAuction] = useState<AuctionLot>();
  const [descLoading, setDescLoading] = useState(false);
  const [imageUploading, setImageUploading] = useState(false);
  const [uploadFileList, setUploadFileList] = useState<UploadItem[]>([]);
  const [imageURLs, setImageURLs] = useState<string[]>([]);
  const [coverURL, setCoverURL] = useState('');
  const [categoryOptions, setCategoryOptions] = useState<
    AuctionCategoryOption[]
  >(AUCTION_CATEGORY_OPTIONS);
  const categoryOptionsRef = useRef<AuctionCategoryOption[]>(
    AUCTION_CATEGORY_OPTIONS
  );
  const [incrementRuleType, setIncrementRuleType] =
    useState<IncrementRuleType>('fixed');
  const [ladderSteps, setLadderSteps] = useState<LadderStepForm[]>(
    createDefaultLadderSteps()
  );

  useEffect(() => {
    async function loadCategoryOptions() {
      try {
        const result = await listAuctionCategories();
        const options = (result.categories || [])
          .map((category) => ({
            label: category.name,
            value: category.id,
          }))
          .filter((option) => option.label && option.value);
        if (options.length) {
          categoryOptionsRef.current = options;
          setCategoryOptions(options);
        }
      } catch {
        categoryOptionsRef.current = AUCTION_CATEGORY_OPTIONS;
        setCategoryOptions(AUCTION_CATEGORY_OPTIONS);
      }
    }
    loadCategoryOptions();
  }, []);

  useEffect(() => {
    if (mode !== 'edit' || !params.id) {
      form.setFieldsValue({
        condition: 'GOOD',
        startPrice: 0,
        reservePrice: 0,
        capPrice: 0,
        incrementAmount: 1,
        maxBidSteps: 1,
        antiSnipingSec: 15,
        antiExtendSec: 30,
        antiExtendMode: 'ADD',
        depositAmount: 0,
      });
      setImageURLs([]);
      setCoverURL('');
      setIncrementRuleType('fixed');
      setLadderSteps(createDefaultLadderSteps());
      return;
    }
    const auctionId = params.id;
    async function load() {
      setLoading(true);
      try {
        const result = await fetchAuction(auctionId);
        setAuction(result);
        const formValues = auctionToFormValues(
          result,
          categoryOptionsRef.current
        );
        form.setFieldsValue(formValues);
        setIncrementRuleType(result.incrementRule?.type || 'fixed');
        setLadderSteps(
          auctionToLadderSteps(
            result,
            formValues.startPrice,
            formValues.capPrice
          )
        );
        const nextImageURLs = mergeImageURLs(
          result.imageUrls || [],
          result.coverUrl
        );
        setImageURLs(nextImageURLs);
        setCoverURL(result.coverUrl || nextImageURLs[0] || '');
      } catch {
        Message.error('拍品详情加载失败，请稍后重试。');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [form, mode, params.id]);

  async function submit(status: WritableAuctionStatus) {
    try {
      const auctionId = params.id;
      if (mode === 'edit' && !auctionId) {
        throw new Error('缺少拍品 ID，无法保存。');
      }
      const values = await form.validate();
      const payload = {
        ...valuesToPayload(
          values,
          imageURLs,
          coverURL,
          incrementRuleType,
          ladderSteps,
          categoryOptions
        ),
        status,
      };
      setSaving(status);
      const result =
        mode === 'create'
          ? await createAuction(payload)
          : await updateAuction(auctionId, payload);
      Message.success(status === 'DRAFT' ? '已暂存' : '拍品已提交审核');
      history.push(`/auctions/${result.auctionId}`);
    } catch (error) {
      if (error instanceof Error) {
        Message.error(error.message);
      }
    } finally {
      setSaving(null);
    }
  }

  async function optimizeDescription() {
    const values = form.getFieldsValue();
    const category = normalizeAuctionCategory(values.category, categoryOptions);
    const imageURL = coverURL || imageURLs[0];
    if (!values.title?.trim() || !category || !values.condition) {
      Message.warning('请先填写拍品标题、类目和成色。');
      return;
    }
    if (!imageURL) {
      Message.warning('请先上传至少一张拍品图片，再进行 AI 优化。');
      return;
    }
    const data = new FormData();
    data.append('imageUrl', imageURL);
    data.append('title', values.title.trim());
    data.append('category', category);
    data.append('condition', values.condition || 'GOOD');
    setDescLoading(true);
    try {
      const result = await optimizeLotDescription(data);
      const optimizedCategory = normalizeAuctionCategory(
        result.category,
        categoryOptions
      );
      form.setFieldsValue({
        title: result.title || values.title,
        category: optimizedCategory || values.category,
        description: result.description || values.description,
      });
      Message.success('拍品描述已优化。');
    } catch {
      Message.error('拍品描述优化失败，请稍后重试。');
    } finally {
      setDescLoading(false);
    }
  }

  async function uploadLotImages(uploadItems: UploadItem[]) {
    const files = getUploadFiles(uploadItems);
    if (files.length === 0) {
      return;
    }
    const oversizedFile = files.find(
      (file) => file.size > MAX_AUCTION_IMAGE_SIZE
    );
    if (oversizedFile) {
      Message.error(
        `图片 ${oversizedFile.name} 为 ${formatUploadSize(
          oversizedFile.size
        )}，超过单张 ${formatUploadSize(
          MAX_AUCTION_IMAGE_SIZE
        )} 限制，请压缩后再上传。`
      );
      return;
    }
    const totalSize = files.reduce((sum, file) => sum + file.size, 0);
    if (totalSize > MAX_AUCTION_IMAGE_UPLOAD_TOTAL_SIZE) {
      Message.error(
        `本次选择的图片合计 ${formatUploadSize(
          totalSize
        )}，超过 ${formatUploadSize(
          MAX_AUCTION_IMAGE_UPLOAD_TOTAL_SIZE
        )} 限制，请减少图片数量或压缩后再上传。`
      );
      return;
    }
    const data = new FormData();
    files.forEach((file) => data.append('images', file));
    setImageUploading(true);
    try {
      const result = await uploadAuctionImages(data);
      const nextImageURLs = uniqueUploadedURLs([
        ...imageURLs,
        ...(result.imageUrls || []),
      ]);
      setImageURLs(nextImageURLs);
      setCoverURL(coverURL || result.coverUrl || nextImageURLs[0] || '');
      Message.success('拍品图片上传成功。');
    } catch (error) {
      const apiError = error as { status?: number; message?: string };
      if (apiError.status === 413) {
        Message.error(
          `图片过大，请压缩后再上传。单张不超过 ${formatUploadSize(
            MAX_AUCTION_IMAGE_SIZE
          )}，本次上传不超过 ${formatUploadSize(
            MAX_AUCTION_IMAGE_UPLOAD_TOTAL_SIZE
          )}。`
        );
        return;
      }
      Message.error(apiError.message || '拍品图片上传失败，请稍后重试。');
    } finally {
      setImageUploading(false);
    }
  }

  async function handleUploadLotImages(uploadItems: UploadItem[]) {
    setUploadFileList(uploadItems);
    try {
      await uploadLotImages(uploadItems);
    } finally {
      setUploadFileList([]);
    }
  }

  function removeImage(url: string) {
    const nextImageURLs = imageURLs.filter((item) => item !== url);
    setImageURLs(nextImageURLs);
    if (coverURL === url) {
      setCoverURL(nextImageURLs[0] || '');
    }
  }

  function makeCover(url: string) {
    setCoverURL(url);
  }

  function getCurrentStartPrice() {
    return normalizePrice(form.getFieldsValue().startPrice);
  }

  function getCurrentCapPrice() {
    return getConfiguredCapPrice(form.getFieldsValue().capPrice);
  }

  function handleFormValuesChange(changedValues: Partial<AuctionFormValues>) {
    if (
      Object.prototype.hasOwnProperty.call(changedValues, 'startPrice') ||
      Object.prototype.hasOwnProperty.call(changedValues, 'capPrice')
    ) {
      const values = form.getFieldsValue();
      const nextStartPrice = normalizePrice(values.startPrice);
      const nextCapPrice = getConfiguredCapPrice(values.capPrice);
      setLadderSteps((currentSteps) =>
        normalizeLadderStepsWithPriceBounds(
          currentSteps,
          nextStartPrice,
          nextCapPrice
        )
      );
    }
    if (
      Object.prototype.hasOwnProperty.call(changedValues, 'antiSnipingSec') ||
      Object.prototype.hasOwnProperty.call(changedValues, 'antiExtendSec') ||
      Object.prototype.hasOwnProperty.call(changedValues, 'antiExtendMode')
    ) {
      void form.validate(['antiExtendSec']).catch(() => undefined);
    }
  }

  function handleIncrementRuleTypeChange(value: IncrementRuleType) {
    setIncrementRuleType(value);
    if (value === 'ladder') {
      setLadderSteps((currentSteps) =>
        normalizeLadderStepsWithPriceBounds(
          currentSteps,
          getCurrentStartPrice(),
          getCurrentCapPrice()
        )
      );
    }
  }

  function updateLadderStep(
    index: number,
    field: keyof LadderStepForm,
    value: number | string | undefined
  ) {
    setLadderSteps((currentSteps) => {
      const nextSteps = currentSteps.map((step) => ({ ...step }));
      nextSteps[index] = {
        ...nextSteps[index],
        [field]: toOptionalNumber(value),
      };
      if (field === 'max' && index < nextSteps.length - 1) {
        nextSteps[index + 1].min = toOptionalNumber(value);
      }
      return nextSteps;
    });
  }

  function addLadderStep() {
    setLadderSteps((currentSteps) => {
      if (currentSteps.length === 0) {
        return createDefaultLadderSteps(
          getCurrentStartPrice(),
          getCurrentCapPrice()
        );
      }
      const nextSteps = currentSteps.map((step) => ({ ...step }));
      const lastStep = nextSteps[nextSteps.length - 1];
      const nextMin = normalizePrice(lastStep?.min, getCurrentStartPrice());
      lastStep.max = getDefaultLadderMax(nextMin);
      nextSteps.push({
        min: lastStep.max,
        amount: lastStep.amount || 1,
      });
      return normalizeLadderStepsWithPriceBounds(
        nextSteps,
        getCurrentStartPrice(),
        getCurrentCapPrice()
      );
    });
  }

  function removeLadderStep(index: number) {
    setLadderSteps((currentSteps) => {
      if (currentSteps.length <= 1) {
        Message.warning('阶梯加价至少保留一个档位。');
        return currentSteps;
      }
      const nextSteps = currentSteps
        .filter((_, stepIndex) => stepIndex !== index)
        .map((step) => ({ ...step }));
      return normalizeLadderStepsWithPriceBounds(
        nextSteps,
        getCurrentStartPrice(),
        getCurrentCapPrice()
      );
    });
  }

  return (
    <AppPage
      title={mode === 'create' ? '创建拍品' : '编辑拍品'}
      extra={
        <Space>
          {auction ? renderAuctionStatusTag(auction.status) : null}
          <Button onClick={() => history.push('/auctions/list')}>
            返回列表
          </Button>
          <Button loading={saving === 'DRAFT'} onClick={() => submit('DRAFT')}>
            暂存
          </Button>
          <Button
            type="primary"
            loading={saving === 'PENDING_AUDIT'}
            onClick={() => submit('PENDING_AUDIT')}
          >
            发布
          </Button>
        </Space>
      }
    >
      <Spin loading={loading} style={{ width: '100%' }}>
        <Form
          form={form}
          layout="vertical"
          className={styles.auctionForm}
          onValuesChange={handleFormValuesChange}
        >
          <Card
            title="拍品展示信息"
            bordered={false}
            className={styles.formSection}
          >
            <Row gutter={24}>
              <Col xs={24} lg={12}>
                <Form.Item
                  field="title"
                  label="拍品标题"
                  rules={[{ required: true, message: '请输入拍品标题' }]}
                >
                  <Input placeholder="例如：复古机械表孤品" />
                </Form.Item>
              </Col>
              <Col xs={24} lg={12}>
                <Form.Item field="subtitle" label="商品简介">
                  <Input placeholder="例如：GIA 证书 主播实拍" maxLength={256} />
                </Form.Item>
              </Col>
            </Row>
            <Row gutter={24}>
              <Col xs={24} md={12} lg={6}>
                <Form.Item
                  field="category"
                  label="类目"
                  rules={[{ required: true, message: '请选择类目' }]}
                >
                  <Select
                    placeholder="请选择固定类目"
                    options={categoryOptions}
                    allowClear
                  />
                </Form.Item>
              </Col>
              <Col xs={24} md={12} lg={6}>
                <Form.Item field="brand" label="品牌">
                  <Input placeholder="可选" />
                </Form.Item>
              </Col>
            </Row>
            <Row gutter={24}>
              <Col xs={24} md={12} lg={6}>
                <Form.Item
                  field="condition"
                  label="成色"
                  rules={[{ required: true, message: '请选择成色' }]}
                >
                  <Select options={CONDITION_OPTIONS} />
                </Form.Item>
              </Col>
            </Row>

            <div className={styles.lotImagePanel}>
              <div className={styles.lotImageToolbar}>
                <div>
                  <div className={styles.lotImageTitle}>拍品图片</div>
                  <Typography.Text type="secondary">
                    单张图片不超过 {formatUploadSize(MAX_AUCTION_IMAGE_SIZE)}
                    ，本次上传不超过{' '}
                    {formatUploadSize(MAX_AUCTION_IMAGE_UPLOAD_TOTAL_SIZE)}
                    ；封面默认使用首图，也可以手动指定。
                  </Typography.Text>
                </div>
                <Upload
                  autoUpload={false}
                  showUploadList={false}
                  fileList={uploadFileList}
                  multiple
                  beforeUpload={(file) => {
                    if (file.size > MAX_AUCTION_IMAGE_SIZE) {
                      Message.error(
                        `图片 ${file.name} 超过 ${formatUploadSize(
                          MAX_AUCTION_IMAGE_SIZE
                        )} 限制，请压缩后再上传。`
                      );
                      return false;
                    }
                    return true;
                  }}
                  onChange={handleUploadLotImages}
                  accept="image/*"
                >
                  <Button icon={<IconUpload />} loading={imageUploading}>
                    上传图片
                  </Button>
                </Upload>
              </div>
              {imageURLs.length > 0 ? (
                <div className={styles.lotImageGrid}>
                  {imageURLs.map((url) => {
                    const isCover = coverURL === url;
                    return (
                      <div
                        key={url}
                        className={`${styles.lotImageTile} ${
                          isCover ? styles.lotImageTileActive : ''
                        }`}
                      >
                        <SafeImage
                          src={url}
                          alt="拍品图片"
                          className={styles.lotImagePreview}
                        />
                        {isCover ? (
                          <span className={styles.lotCoverBadge}>封面</span>
                        ) : null}
                        <div className={styles.lotImageActions}>
                          {!isCover ? (
                            <Button
                              size="mini"
                              type="text"
                              icon={<IconStar />}
                              htmlType="button"
                              onClick={() => makeCover(url)}
                            >
                              设为封面
                            </Button>
                          ) : null}
                          <Button
                            size="mini"
                            type="text"
                            status="danger"
                            icon={<IconDelete />}
                            htmlType="button"
                            onClick={() => removeImage(url)}
                          >
                            删除
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className={styles.lotImageEmpty}>
                  <IconImage />
                  <span>还没有上传拍品图片</span>
                </div>
              )}
            </div>

            <Form.Item field="description" label="拍品描述">
              <Input.TextArea
                placeholder="描述拍品卖点、瑕疵、配件、售后说明等"
                autoSize={{ minRows: 4, maxRows: 8 }}
              />
            </Form.Item>
            <Space direction="vertical">
              <Typography.Text type="secondary">
                使用当前封面图和拍品信息生成/优化描述，不会阻塞拍品创建。
              </Typography.Text>
              <Button
                htmlType="button"
                loading={descLoading}
                onClick={optimizeDescription}
              >
                AI 优化拍品描述
              </Button>
            </Space>
          </Card>

          <Card
            title="起拍规则"
            bordered={false}
            className={styles.formSection}
          >
            <div className={styles.auctionRuleBoard}>
              <section className={styles.auctionRuleGroup}>
                <div className={styles.auctionRuleGroupHead}>
                  <strong>价格设置</strong>
                  <span>起拍、保留、封顶与保证金</span>
                </div>
                <Row gutter={16}>
                  <Col xs={24} md={12} lg={6}>
                    <Form.Item
                      field="startPrice"
                      label="起拍价（元）"
                      rules={[{ required: true }]}
                    >
                      <InputNumber min={0} precision={2} />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={12} lg={6}>
                    <Form.Item field="reservePrice" label="保留价（元）">
                      <InputNumber min={0} precision={2} />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={12} lg={6}>
                    <Form.Item field="capPrice" label="落锤价（元）">
                      <InputNumber min={0} precision={2} />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={12} lg={6}>
                    <Form.Item field="depositAmount" label="保证金（元）">
                      <InputNumber min={0} precision={2} />
                    </Form.Item>
                  </Col>
                </Row>
              </section>

              <section className={styles.auctionRuleGroup}>
                <div className={styles.auctionRuleGroupHead}>
                  <strong>出价节奏</strong>
                  <span>固定/阶梯加价、单次上限与延时规则</span>
                </div>
                <Row gutter={16}>
                  <Col xs={24} md={12} lg={6}>
                    <Form.Item label="加价规则类型" required>
                      <Select
                        options={INCREMENT_RULE_TYPE_OPTIONS}
                        value={incrementRuleType}
                        onChange={(value) =>
                          handleIncrementRuleTypeChange(
                            value as IncrementRuleType
                          )
                        }
                      />
                    </Form.Item>
                  </Col>
                  {incrementRuleType === 'fixed' ? (
                    <Col xs={24} md={12} lg={6}>
                      <Form.Item
                        field="incrementAmount"
                        label="固定加价幅度（元）"
                        rules={[{ required: true }]}
                      >
                        <InputNumber min={0.01} precision={2} />
                      </Form.Item>
                    </Col>
                  ) : null}
                  <Col xs={24} md={12} lg={6}>
                    <Form.Item
                      field="maxBidSteps"
                      label="单次最多加价步数"
                      rules={[{ required: true }]}
                    >
                      <InputNumber min={1} precision={0} />
                    </Form.Item>
                  </Col>
                </Row>
                {incrementRuleType === 'ladder' ? (
                  <Space
                    direction="vertical"
                    size={12}
                    style={{ width: '100%', marginBottom: 16 }}
                  >
                    {ladderSteps.map((step, index) => {
                      const isLastStep = index === ladderSteps.length - 1;
                      return (
                        <div
                          className={styles.ruleStep}
                          key={`ladder-step-${index}`}
                        >
                          <Row gutter={12}>
                            <Col xs={24} md={4}>
                              <Typography.Text style={{ fontWeight: 600 }}>
                                第 {index + 1} 档
                              </Typography.Text>
                            </Col>
                            <Col xs={24} md={6}>
                              <Form.Item label="起始价（元）">
                                <InputNumber
                                  disabled
                                  min={0}
                                  precision={2}
                                  value={step.min}
                                />
                              </Form.Item>
                            </Col>
                            <Col xs={24} md={6}>
                              <Form.Item label="结束价（元）">
                                <InputNumber
                                  disabled={isLastStep}
                                  min={getMinStepMax(step.min)}
                                  precision={2}
                                  value={step.max}
                                  placeholder={
                                    isLastStep
                                      ? '未设置落锤价时不设置结束价'
                                      : undefined
                                  }
                                  onChange={(value) =>
                                    updateLadderStep(index, 'max', value)
                                  }
                                />
                              </Form.Item>
                            </Col>
                            <Col xs={24} md={6}>
                              <Form.Item label="加价金额（元）">
                                <InputNumber
                                  min={0.01}
                                  precision={2}
                                  value={step.amount}
                                  onChange={(value) =>
                                    updateLadderStep(index, 'amount', value)
                                  }
                                />
                              </Form.Item>
                            </Col>
                            <Col xs={24} md={2}>
                              <Button
                                aria-label="删除档位"
                                icon={<IconDelete />}
                                shape="circle"
                                status="danger"
                                style={{ marginTop: 30 }}
                                onClick={() => removeLadderStep(index)}
                              />
                            </Col>
                          </Row>
                        </div>
                      );
                    })}
                    <Button icon={<IconPlus />} onClick={addLadderStep}>
                      添加阶梯档位
                    </Button>
                  </Space>
                ) : null}
                <Row gutter={16}>
                  <Col xs={24} md={12} lg={6}>
                    <Form.Item field="antiSnipingSec" label="反狙击窗口（秒）">
                      <InputNumber min={1} precision={0} />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={12} lg={6}>
                    <Form.Item
                      field="antiExtendSec"
                      label="延长/重置时长（秒）"
                      rules={[
                        {
                          validator: (value, callback) => {
                            const fieldValues = form.getFieldsValue([
                              'antiSnipingSec',
                              'antiExtendMode',
                            ]);
                            callback(
                              getAntiExtendValidationMessage(
                                fieldValues.antiSnipingSec,
                                toOptionalNumber(value),
                                fieldValues.antiExtendMode
                              )
                            );
                          },
                        },
                      ]}
                    >
                      <InputNumber min={1} precision={0} />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={12} lg={6}>
                    <Form.Item field="antiExtendMode" label="反狙击模式">
                      <Select options={ANTI_EXTEND_MODE_OPTIONS} />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={12} lg={6}>
                    <Form.Item field="durationSec" label="拍卖时长（秒）">
                      <InputNumber min={1} precision={0} />
                    </Form.Item>
                  </Col>
                </Row>
              </section>
            </div>
          </Card>
        </Form>
      </Spin>
    </AppPage>
  );
}
