import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Button,
  Card,
  Form,
  Grid,
  InputNumber,
  Message,
  Select,
  Space,
  Typography,
} from '@arco-design/web-react';
import { IconDelete, IconPlus } from '@arco-design/web-react/icon';
import { FormInstance } from '@arco-design/web-react/es/Form';
import { useHistory, useParams } from 'react-router-dom';
import AppPage from '@/components/AppPage';
import AppState from '@/components/AppState';
import {
  AuctionAntiExtendMode,
  AuctionCreateRequest,
  AuctionLot,
  AuctionStatus,
  AuctionIncrementRule,
  WritableAuctionStatus,
  createAuction,
  fetchAuction,
  updateAuction,
} from '@/services/auctions';
import { Item, fetchItem, listItems } from '@/services/items';
import {
  canEditAuctionRules,
  centToYuan,
  getFixedIncrementAmount,
  getIncrementRuleLadderSteps,
  getMaxBidSteps,
  isLadderIncrementRule,
  normalizeJsonRuleValue,
  renderReadonlyReason,
  renderAuctionStatusTag,
  yuanToCent,
} from './utils';
import styles from '../management.module.less';

interface AuctionFormPageProps {
  mode: 'create' | 'edit';
}

interface AuctionFormValues {
  itemId: number;
  startPrice: number;
  reservePrice?: number;
  capPrice?: number;
  incrementRuleType: IncrementRuleType;
  incrementAmount: number;
  maxBidSteps: number;
  antiSnipingSec: number;
  antiExtendSec: number;
  antiExtendMode: AuctionAntiExtendMode;
  depositAmount: number;
}

const Row = Grid.Row;
const Col = Grid.Col;

type IncrementRuleType = 'fixed' | 'ladder';
type AuctionSubmitAction = 'SAVE' | 'DRAFT';

interface LadderStepForm {
  min?: number;
  max?: number;
  amount?: number;
}

const INCREMENT_RULE_TYPE_OPTIONS = [
  { label: '固定加价', value: 'fixed' },
  { label: '阶梯加价', value: 'ladder' },
];

const ANTI_EXTEND_MODE_OPTIONS = [
  { label: '增加时长', value: 'ADD' },
  { label: '重置倒计时', value: 'RESET' },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toOptionalNumber(value: unknown) {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) ? parsedValue : undefined;
}

function createDefaultLadderSteps(): LadderStepForm[] {
  return [
    { min: 0, max: 100, amount: 1 },
    { min: 100, amount: 5 },
  ];
}

function readFirstNumber(
  record: Record<string, unknown>,
  keys: string[]
): number | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
  }

  return undefined;
}

function getIncrementRuleType(
  rule?: AuctionLot['incrementRule']
): IncrementRuleType {
  return isLadderIncrementRule(rule) ? 'ladder' : 'fixed';
}

function mapLadderStepsToFormValues(
  rule?: AuctionLot['incrementRule']
): LadderStepForm[] {
  const steps = getIncrementRuleLadderSteps(rule);

  if (!steps.length) {
    return createDefaultLadderSteps();
  }

  return steps.map((step, index) => {
    const normalizedStep = normalizeJsonRuleValue(step);

    if (!isRecord(normalizedStep)) {
      return {
        min: index === 0 ? 0 : undefined,
        amount: 1,
      };
    }

    const min = readFirstNumber(normalizedStep, [
      'min',
      'minPrice',
      'from',
      'priceFrom',
      'lower',
      'threshold',
    ]);
    const max = readFirstNumber(normalizedStep, [
      'max',
      'maxPrice',
      'to',
      'priceTo',
      'upTo',
      'upper',
      'lt',
      'lte',
    ]);
    const amount = readFirstNumber(normalizedStep, [
      'amount',
      'incrementAmount',
      'increment',
      'inc',
      'step',
    ]);

    return {
      min: centToYuan(min) ?? (index === 0 ? 0 : undefined),
      max: max !== undefined ? centToYuan(max) : undefined,
      amount: centToYuan(amount) ?? 1,
    };
  });
}

function buildLadderStepsPayload(steps: LadderStepForm[]) {
  if (steps.length === 0) {
    throw new Error('请至少配置一个阶梯加价档位。');
  }

  let previousMax: number | undefined;

  return steps.map((step, index) => {
    const min = yuanToCent(toOptionalNumber(step.min));
    const max = yuanToCent(toOptionalNumber(step.max));
    const amount = yuanToCent(toOptionalNumber(step.amount));
    const isLastStep = index === steps.length - 1;

    if (min === undefined || min < 0) {
      throw new Error(`第 ${index + 1} 档起始价不能为空，且不能小于 0。`);
    }

    if (index === 0 && min !== 0) {
      throw new Error('阶梯加价第一档起始价必须为 0。');
    }

    if (index > 0 && previousMax !== undefined && min !== previousMax) {
      throw new Error(`第 ${index + 1} 档起始价必须等于上一档结束价。`);
    }

    if (!amount || amount < 1) {
      throw new Error(`第 ${index + 1} 档加价金额必须大于 0。`);
    }

    if (isLastStep) {
      if (max !== undefined) {
        throw new Error('阶梯加价最后一档结束价请留空。');
      }

      return {
        min,
        amount,
      };
    }

    if (max === undefined) {
      throw new Error(`第 ${index + 1} 档结束价不能为空。`);
    }

    if (max <= min) {
      throw new Error(`第 ${index + 1} 档结束价必须大于起始价。`);
    }

    previousMax = max;

    return {
      min,
      max,
      amount,
    };
  });
}

function buildIncrementRule(
  values: AuctionFormValues,
  incrementRuleType: IncrementRuleType,
  ladderSteps: LadderStepForm[]
): AuctionIncrementRule {
  const maxBidSteps = Number(values.maxBidSteps);

  if (!Number.isInteger(maxBidSteps) || maxBidSteps < 1) {
    throw new Error('单次最多加价步数必须为大于 0 的整数。');
  }

  if (incrementRuleType === 'ladder') {
    return {
      type: 'ladder',
      maxBidSteps,
      steps: buildLadderStepsPayload(ladderSteps),
    };
  }

  const fixedAmount = yuanToCent(values.incrementAmount);

  if (!fixedAmount || fixedAmount < 1) {
    throw new Error('固定加价幅度必须大于 0。');
  }

  return {
    type: 'fixed',
    amount: fixedAmount,
    maxBidSteps,
  };
}

function buildPayload(
  values: AuctionFormValues,
  incrementRuleType: IncrementRuleType,
  ladderSteps: LadderStepForm[],
  status: WritableAuctionStatus
): AuctionCreateRequest {
  const startPrice = yuanToCent(values.startPrice) || 0;
  const reservePrice = yuanToCent(values.reservePrice) || 0;
  const capPrice = yuanToCent(values.capPrice);

  if (capPrice !== undefined && capPrice <= startPrice) {
    throw new Error('封顶价必须大于起拍价。');
  }

  if (capPrice !== undefined && reservePrice > capPrice) {
    throw new Error('保留价不能高于封顶价。');
  }

  const payload: AuctionCreateRequest = {
    itemId: Number(values.itemId),
    auctionType: 'ENGLISH',
    startPrice,
    reservePrice,
    ...(capPrice !== undefined ? { capPrice } : {}),
    depositAmount: yuanToCent(values.depositAmount) || 0,
    incrementRule: buildIncrementRule(values, incrementRuleType, ladderSteps),
    antiSnipingSec: Number(values.antiSnipingSec),
    antiExtendSec: Number(values.antiExtendSec),
    antiExtendMode: values.antiExtendMode || 'ADD',
    status,
  };

  return payload;
}

function mapAuctionToFormValues(
  auction: AuctionLot
): Partial<AuctionFormValues> {
  return {
    itemId: Number(auction.itemId),
    startPrice: centToYuan(auction.startPrice) || 0,
    reservePrice: auction.reservePrice
      ? centToYuan(auction.reservePrice)
      : undefined,
    capPrice: auction.capPrice ? centToYuan(auction.capPrice) : undefined,
    incrementRuleType: getIncrementRuleType(auction.incrementRule),
    incrementAmount: getFixedIncrementAmount(auction.incrementRule) || 1,
    maxBidSteps: getMaxBidSteps(auction.incrementRule) || 1,
    antiSnipingSec: auction.antiSnipingSec,
    antiExtendSec: auction.antiExtendSec,
    antiExtendMode: auction.antiExtendMode || 'ADD',
    depositAmount: centToYuan(auction.depositAmount) || 0,
  };
}

function mergeItemsById(previousItems: Item[], nextItems: Item[]) {
  const itemMap = new Map<string, Item>();

  previousItems.forEach((item) => {
    itemMap.set(String(item.id), item);
  });
  nextItems.forEach((item) => {
    itemMap.set(String(item.id), item);
  });

  return Array.from(itemMap.values());
}

function resolveSubmitStatus(
  action: AuctionSubmitAction
): WritableAuctionStatus {
  if (action === 'DRAFT') {
    return 'DRAFT';
  }

  return 'READY';
}

function canSaveDraft(isEdit: boolean, currentStatus?: AuctionStatus) {
  return (
    !isEdit || currentStatus === 'DRAFT' || currentStatus === 'PENDING_AUDIT'
  );
}

export default function AuctionFormPage(props: AuctionFormPageProps) {
  const { mode } = props;
  const history = useHistory();
  const { id } = useParams() as { id?: string };
  const formRef = useRef<FormInstance>();
  const [auction, setAuction] = useState<AuctionLot>();
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(mode === 'edit');
  const [itemsLoading, setItemsLoading] = useState(false);
  const [submitting, setSubmitting] = useState<AuctionSubmitAction | null>(
    null
  );
  const submitActionRef = useRef<AuctionSubmitAction | null>(null);
  const [loadError, setLoadError] = useState('');
  const [loadedFormValues, setLoadedFormValues] =
    useState<Partial<AuctionFormValues>>();
  const [incrementRuleType, setIncrementRuleType] =
    useState<IncrementRuleType>('fixed');
  const [ladderSteps, setLadderSteps] = useState<LadderStepForm[]>(
    createDefaultLadderSteps()
  );

  const isEdit = mode === 'edit';
  const editable = !isEdit || canEditAuctionRules(auction?.status);
  const draftSavable = canSaveDraft(isEdit, auction?.status);
  const itemOptions = useMemo(() => {
    const optionMap = new Map<number, { label: string; value: number }>();

    items.forEach((item) => {
      optionMap.set(Number(item.id), {
        label: `${item.title} / ${item.category || '未分类'}`,
        value: Number(item.id),
      });
    });

    if (auction && !optionMap.has(Number(auction.itemId))) {
      optionMap.set(Number(auction.itemId), {
        label: '已关联商品',
        value: Number(auction.itemId),
      });
    }

    return Array.from(optionMap.values());
  }, [auction, items]);

  useEffect(() => {
    async function loadSelectableItems() {
      setItemsLoading(true);
      try {
        const result = await listItems({
          limit: 50,
          offset: 0,
        });
        setItems((currentItems) =>
          mergeItemsById(currentItems, result.items || [])
        );
      } catch (error) {
        Message.warning('商品列表加载失败，可稍后返回商品管理确认商品状态。');
      } finally {
        setItemsLoading(false);
      }
    }

    loadSelectableItems();
  }, []);

  useEffect(() => {
    if (!isEdit || !id) {
      return;
    }

    async function loadAuctionDetail() {
      setLoading(true);
      setLoadError('');
      try {
        const result = await fetchAuction(id);
        const formValues = mapAuctionToFormValues(result);
        setAuction(result);
        setIncrementRuleType(formValues.incrementRuleType || 'fixed');
        setLadderSteps(mapLadderStepsToFormValues(result.incrementRule));
        setLoadedFormValues(formValues);
        try {
          const linkedItem = await fetchItem(result.itemId);
          setItems((currentItems) =>
            mergeItemsById(currentItems, [linkedItem])
          );
        } catch (error) {
          setItems((currentItems) => mergeItemsById(currentItems, []));
        }
      } catch (error) {
        setLoadError('拍品详情加载失败，暂时无法展示已保存内容。');
      } finally {
        setLoading(false);
      }
    }

    loadAuctionDetail();
  }, [id, isEdit]);

  useEffect(() => {
    if (loading || !loadedFormValues) {
      return;
    }

    formRef.current?.setFieldsValue(loadedFormValues);
  }, [loadedFormValues, loading]);

  async function handleSubmit(values: AuctionFormValues) {
    if (!editable) {
      Message.warning('当前拍品状态不允许修改规则。');
      return;
    }

    const submitAction = submitActionRef.current || 'SAVE';
    const targetStatus = resolveSubmitStatus(submitAction);

    let payload: AuctionCreateRequest;
    try {
      payload = buildPayload(
        values,
        values.incrementRuleType || incrementRuleType,
        ladderSteps,
        targetStatus
      );
    } catch (error) {
      if (error instanceof Error) {
        Message.error(error.message);
      }
      return;
    }

    setSubmitting(submitAction);
    try {
      const result =
        isEdit && id
          ? await updateAuction(id, {
              startPrice: payload.startPrice,
              reservePrice: payload.reservePrice,
              capPrice: payload.capPrice,
              incrementRule: payload.incrementRule,
              antiSnipingSec: payload.antiSnipingSec,
              antiExtendSec: payload.antiExtendSec,
              antiExtendMode: payload.antiExtendMode,
              depositAmount: payload.depositAmount,
              status: payload.status,
            })
          : await createAuction(payload);
      const successMessage = isEdit
        ? '拍品保存成功'
        : targetStatus === 'DRAFT'
        ? '已保存为草稿'
        : '拍品创建成功';
      Message.success(successMessage);
      history.push(`/auctions/${result.auctionId}`);
    } catch (error) {
      if (error instanceof Error) {
        Message.error(error.message);
      }
    } finally {
      setSubmitting(null);
      submitActionRef.current = null;
    }
  }

  function triggerSubmit(action: AuctionSubmitAction) {
    submitActionRef.current = action;
    formRef.current?.submit();
  }

  function handleIncrementRuleTypeChange(value: IncrementRuleType) {
    setIncrementRuleType(value);
    formRef.current?.setFieldsValue({
      incrementRuleType: value,
    });
    if (value === 'ladder' && ladderSteps.length === 0) {
      setLadderSteps(createDefaultLadderSteps());
    }
  }

  function handleLadderStepChange(
    index: number,
    field: keyof LadderStepForm,
    value: unknown
  ) {
    const nextValue = toOptionalNumber(value);

    setLadderSteps((previousSteps) =>
      previousSteps.map((step, stepIndex) => {
        if (stepIndex === index) {
          return {
            ...step,
            [field]: nextValue,
          };
        }

        if (field === 'max' && stepIndex === index + 1) {
          return {
            ...step,
            min: nextValue,
          };
        }

        return step;
      })
    );
  }

  function handleAddLadderStep() {
    const lastStep = ladderSteps[ladderSteps.length - 1];
    const nextMin = toOptionalNumber(lastStep?.max);

    if (nextMin === undefined) {
      Message.warning('请先填写最后一档结束价，再添加下一档。');
      return;
    }

    setLadderSteps([
      ...ladderSteps,
      {
        min: nextMin,
        amount: lastStep?.amount || 1,
      },
    ]);
  }

  function handleRemoveLadderStep(index: number) {
    if (ladderSteps.length <= 1) {
      setLadderSteps(createDefaultLadderSteps());
      return;
    }

    const nextSteps = ladderSteps.filter((_, stepIndex) => stepIndex !== index);

    if (index === 0 && nextSteps[0]) {
      nextSteps[0] = {
        ...nextSteps[0],
        min: 0,
      };
    }

    if (index > 0 && nextSteps[index]) {
      nextSteps[index] = {
        ...nextSteps[index],
        min: nextSteps[index - 1]?.max,
      };
    }

    setLadderSteps(nextSteps);
  }

  if (loadError) {
    return (
      <AppPage title={isEdit ? '编辑拍品规则' : '创建拍品'}>
        <Card>
          <AppState
            status="500"
            title="拍品信息加载失败"
            subtitle={loadError}
            actionText="返回列表"
            onAction={() => history.push('/auctions/list')}
          />
        </Card>
      </AppPage>
    );
  }

  return (
    <AppPage
      title={isEdit ? '编辑拍品规则' : '创建拍品'}
      extra={
        <Space>
          <Button onClick={() => history.push('/auctions/list')}>
            返回列表
          </Button>
          {isEdit && id ? (
            <Button onClick={() => history.push(`/auctions/${id}`)}>
              查看详情
            </Button>
          ) : null}
        </Space>
      }
    >
      <Card loading={loading} className={styles.tableCard}>
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          {auction ? (
            <Typography.Paragraph style={{ marginBottom: 0 }}>
              当前状态：{renderAuctionStatusTag(auction.status)}
            </Typography.Paragraph>
          ) : null}
          {renderReadonlyReason(auction?.status)}
          <Form
            ref={formRef}
            layout="vertical"
            initialValues={{
              startPrice: 0,
              incrementRuleType: 'fixed',
              incrementAmount: 1,
              maxBidSteps: 5,
              antiSnipingSec: 15,
              antiExtendSec: 30,
              antiExtendMode: 'ADD',
              depositAmount: 0,
            }}
            onSubmit={handleSubmit}
          >
            <Form.Item
              field="itemId"
              label="关联商品"
              rules={[{ required: true, message: '请选择商品' }]}
              extra="创建拍品前请先在商品管理中维护商品基础信息。"
            >
              <Select
                disabled={isEdit || !editable}
                loading={itemsLoading}
                options={itemOptions}
                placeholder="请选择商品"
                showSearch
                allowClear
              />
            </Form.Item>

            <Card title="价格设置" className={styles.formSection}>
              <Row gutter={16}>
                <Col span={6}>
                  <Form.Item
                    field="startPrice"
                    label="起拍价（元）"
                    rules={[
                      {
                        required: true,
                        message: '请输入起拍价，允许 0 元起拍',
                      },
                    ]}
                  >
                    <InputNumber
                      disabled={!editable}
                      min={0}
                      precision={2}
                      step={1}
                    />
                  </Form.Item>
                </Col>
                <Col span={6}>
                  <Form.Item
                    field="reservePrice"
                    label="保留价（元）"
                    extra="不填表示无保留价。"
                  >
                    <InputNumber
                      disabled={!editable}
                      min={0}
                      precision={2}
                      step={1}
                    />
                  </Form.Item>
                </Col>
                <Col span={6}>
                  <Form.Item
                    field="capPrice"
                    label="封顶价（元）"
                    extra="不填表示不设置封顶成交价。"
                  >
                    <InputNumber
                      disabled={!editable}
                      min={0.01}
                      precision={2}
                      step={10}
                    />
                  </Form.Item>
                </Col>
                <Col span={6}>
                  <Form.Item
                    field="depositAmount"
                    label="保证金（元）"
                    rules={[{ required: true, message: '请输入保证金金额' }]}
                  >
                    <InputNumber
                      disabled={!editable}
                      min={0}
                      precision={2}
                      step={10}
                    />
                  </Form.Item>
                </Col>
              </Row>
            </Card>

            <Card title="加价规则" className={styles.formSection}>
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item
                    field="incrementRuleType"
                    label="加价规则类型"
                    rules={[{ required: true, message: '请选择加价规则类型' }]}
                  >
                    <Select
                      disabled={!editable}
                      options={INCREMENT_RULE_TYPE_OPTIONS}
                      onChange={handleIncrementRuleTypeChange}
                    />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item
                    field="maxBidSteps"
                    label="单次最多加价步数"
                    rules={[
                      { required: true, message: '请输入单次最多加价步数' },
                    ]}
                    extra="限制单次出价不能一次性拉高过多。"
                  >
                    <InputNumber
                      disabled={!editable}
                      min={1}
                      precision={0}
                      step={1}
                    />
                  </Form.Item>
                </Col>
              </Row>
              {incrementRuleType === 'fixed' ? (
                <Row gutter={16}>
                  <Col span={12}>
                    <Form.Item
                      field="incrementAmount"
                      label="固定加价金额（元）"
                      rules={[
                        { required: true, message: '请输入固定加价幅度' },
                      ]}
                    >
                      <InputNumber
                        disabled={!editable}
                        min={0.01}
                        precision={2}
                        step={1}
                      />
                    </Form.Item>
                  </Col>
                </Row>
              ) : (
                <Form.Item label="阶梯加价档位" required>
                  <Space
                    direction="vertical"
                    size={12}
                    style={{ width: '100%' }}
                  >
                    {ladderSteps.map((step, index) => (
                      <div
                        className={styles.ruleStep}
                        key={`ladder-step-${index}`}
                      >
                        <Row gutter={12}>
                          <Col span={5}>
                            <Typography.Text style={{ fontWeight: 600 }}>
                              第 {index + 1} 档
                            </Typography.Text>
                          </Col>
                          <Col span={6}>
                            <Form.Item label="起始价（元）">
                              <InputNumber
                                disabled
                                min={0}
                                precision={2}
                                step={1}
                                value={step.min}
                              />
                            </Form.Item>
                          </Col>
                          <Col span={6}>
                            <Form.Item label="结束价（元）">
                              <InputNumber
                                disabled={!editable}
                                min={0.01}
                                precision={2}
                                step={10}
                                value={step.max}
                                placeholder="最后一档留空"
                                onChange={(value) =>
                                  handleLadderStepChange(index, 'max', value)
                                }
                              />
                            </Form.Item>
                          </Col>
                          <Col span={6}>
                            <Form.Item label="加价金额（元）">
                              <InputNumber
                                disabled={!editable}
                                min={0.01}
                                precision={2}
                                step={1}
                                value={step.amount}
                                onChange={(value) =>
                                  handleLadderStepChange(index, 'amount', value)
                                }
                              />
                            </Form.Item>
                          </Col>
                          <Col span={1}>
                            <Button
                              aria-label="删除档位"
                              disabled={!editable}
                              icon={<IconDelete />}
                              shape="circle"
                              style={{ marginTop: 30 }}
                              onClick={() => handleRemoveLadderStep(index)}
                            />
                          </Col>
                        </Row>
                      </div>
                    ))}
                    <Button
                      disabled={!editable}
                      icon={<IconPlus />}
                      onClick={handleAddLadderStep}
                    >
                      添加档位
                    </Button>
                  </Space>
                </Form.Item>
              )}
            </Card>

            <Card title="防抢拍设置" className={styles.formSection}>
              <Row gutter={16}>
                <Col span={8}>
                  <Form.Item
                    field="antiSnipingSec"
                    label="触发窗口（秒）"
                    rules={[{ required: true, message: '请输入触发窗口秒数' }]}
                  >
                    <InputNumber
                      disabled={!editable}
                      min={1}
                      precision={0}
                      step={1}
                    />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item
                    field="antiExtendSec"
                    label="延长时长（秒）"
                    rules={[{ required: true, message: '请输入延长秒数' }]}
                  >
                    <InputNumber
                      disabled={!editable}
                      min={1}
                      precision={0}
                      step={1}
                    />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item
                    field="antiExtendMode"
                    label="延时模式"
                    rules={[{ required: true, message: '请选择延时模式' }]}
                  >
                    <Select
                      disabled={!editable}
                      options={ANTI_EXTEND_MODE_OPTIONS}
                    />
                  </Form.Item>
                </Col>
              </Row>
            </Card>

            <Space>
              <Button
                type="primary"
                loading={submitting === 'SAVE'}
                disabled={!editable || submitting === 'DRAFT'}
                onClick={() => triggerSubmit('SAVE')}
              >
                {isEdit ? '保存拍品' : '创建拍品'}
              </Button>
              {draftSavable ? (
                <Button
                  loading={submitting === 'DRAFT'}
                  disabled={!editable || submitting === 'SAVE'}
                  onClick={() => triggerSubmit('DRAFT')}
                >
                  保存为草稿
                </Button>
              ) : null}
              <Button onClick={() => history.push('/auctions/list')}>
                取消
              </Button>
            </Space>
          </Form>
        </Space>
      </Card>
    </AppPage>
  );
}
