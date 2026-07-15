"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, m, useReducedMotion } from "motion/react";
import { CheckPanel } from "@/components/checks/CheckPanel";
import { PageIntro } from "@/components/motion/PageIntro";
import { useRewriteStream } from "@/hooks/useRewriteStream";
import {
  CHECK_SKILLS,
  DEFAULT_CHECK_REQUEST,
  type CheckRequest,
} from "@/lib/checks-shared";
import {
  disclosureVariants,
  introActionVariants,
  introControlItemVariants,
  introControlsVariants,
  introEyebrowVariants,
  introNoteVariants,
  introRailChannelVariants,
  introRailLineVariants,
  introRailMarkVariants,
  introRailVariants,
  introSurfacePartVariants,
  introSurfaceVariants,
  introTitleVariants,
  MECHANICAL_SPRING,
  MOTION_DURATION,
  MOTION_EASE,
} from "@/lib/motion";
import { STYLE_PRESETS } from "@/lib/styles";
import type {
  ProviderRequest,
  PublicProvider,
  StyleId,
} from "@/lib/types";

type ClientProvider = PublicProvider & {
  apiKey?: string;
  baseUrl?: string;
};

const SAMPLES = [
  "凌晨三点，我在厨房里找到最后一杯冷咖啡。",
  "会议结束了，但没有人真正得到答案。",
  "我站在门口，想起那封一直没有寄出的信。",
];

function statusLabel(status: "idle" | "streaming" | "done" | "error") {
  if (status === "streaming") return "接收中";
  if (status === "done") return "已完成";
  if (status === "error") return "调用失败";
  return "待命";
}

export function RewriterWorkbench({
  initialProviders,
}: {
  initialProviders: PublicProvider[];
}) {
  const reduceMotion = useReducedMotion();
  const [text, setText] = useState("");
  const [style, setStyle] = useState<StyleId>("inner_monologue");
  const [providers, setProviders] = useState<ClientProvider[]>(initialProviders);
  const [selectedIds, setSelectedIds] = useState<string[]>(["mock"]);
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
  const [check, setCheck] = useState<CheckRequest>(DEFAULT_CHECK_REQUEST);
  const [showCustom, setShowCustom] = useState(false);
  const [customLabel, setCustomLabel] = useState("");
  const [customBaseUrl, setCustomBaseUrl] = useState("");
  const [customModel, setCustomModel] = useState("");
  const [customApiKey, setCustomApiKey] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const customToggleRef = useRef<HTMLButtonElement>(null);
  const copyTimerRef = useRef<number | null>(null);
  const {
    outputs,
    resultOrder,
    isGenerating,
    error,
    setError,
    checkResult,
    diceState,
    generate: generateStream,
    stop,
    clearCheckResult,
  } = useRewriteStream();

  useEffect(() => () => {
    if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current);
  }, []);

  const selectedProviders = useMemo(
    () =>
      selectedIds
        .map((id) => providers.find((provider) => provider.id === id))
        .filter((provider): provider is ClientProvider => Boolean(provider)),
    [providers, selectedIds],
  );

  const selectedStyle = STYLE_PRESETS.find((preset) => preset.id === style)!;

  function toggleProvider(id: string) {
    setError("");
    clearCheckResult();
    setSelectedIds((current) => {
      if (current.includes(id)) {
        if (current.length === 1) {
          setError("至少保留一个模型");
          return current;
        }
        return current.filter((item) => item !== id);
      }
      if (current.length >= 3) {
        setError("一次最多比较三个模型");
        return current;
      }
      return [...current, id];
    });
  }

  function addCustomProvider() {
    setError("");
    if (!customLabel.trim() || !customBaseUrl.trim() || !customModel.trim() || !customApiKey.trim()) {
      setError("请完整填写自定义供应商信息");
      return;
    }
    if (selectedIds.length >= 3) {
      setError("请先取消一个模型，再添加自定义供应商");
      return;
    }

    const id = `custom-${crypto.randomUUID()}`;
    const provider: ClientProvider = {
      id,
      label: customLabel.trim(),
      model: customModel.trim(),
      baseUrl: customBaseUrl.trim(),
      apiKey: customApiKey.trim(),
      configured: true,
      builtin: false,
      note: "仅保留在当前页面内存中",
    };
    setProviders((current) => [...current, provider]);
    setSelectedIds((current) => [...current, id]);
    clearCheckResult();
    setCustomLabel("");
    setCustomBaseUrl("");
    setCustomModel("");
    setCustomApiKey("");
    customToggleRef.current?.focus();
    setShowCustom(false);
  }

  function removeCustomProvider(id: string) {
    clearCheckResult();
    setProviders((current) => current.filter((provider) => provider.id !== id));
    setSelectedIds((current) => {
      const next = current.filter((item) => item !== id);
      return next.length > 0 ? next : ["mock"];
    });
  }

  async function generate() {
    const source = text.trim();
    setError("");
    if (!source) {
      setError("先写下一段需要改写的文本");
      return;
    }

    const requests: ProviderRequest[] = selectedProviders.map((provider) => ({
      id: provider.id,
      label: provider.label,
      apiKey: provider.apiKey || apiKeys[provider.id] || undefined,
      baseUrl: provider.baseUrl,
      model: provider.model,
    }));

    await generateStream({ text: source, style, providers: requests, check });
  }

  async function copyOutput(id: string) {
    const output = outputs[id]?.text;
    if (!output) return;
    try {
      await navigator.clipboard.writeText(output);
      setCopiedId(id);
      if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current);
      copyTimerRef.current = window.setTimeout(() => {
        setCopiedId(null);
        copyTimerRef.current = null;
      }, 1400);
    } catch {
      setCopiedId(null);
      setError("复制失败，请选中文本后手动复制");
    }
  }

  return (
    <PageIntro>
      <m.aside className="channel-rail" aria-label="意识频道状态" variants={introRailVariants}>
        <m.div className="rail-mark" aria-hidden="true" variants={introRailMarkVariants}>极乐</m.div>
        <m.div className="rail-line" aria-hidden="true" variants={introRailLineVariants} />
        <ol>
          {CHECK_SKILLS.map((channel, index) => (
            <m.li
              key={channel.id}
              className={check.enabled && check.skill === channel.id ? "active" : ""}
              variants={introRailChannelVariants}
              custom={index}
              data-channel={channel.id}
            >
              <span>{String(index + 1).padStart(2, "0")}</span>
              <b>{channel.label}</b>
            </m.li>
          ))}
        </ol>
        <div className="rail-frequency" aria-hidden="true">88.4</div>
      </m.aside>

      <section className="workspace">
        <header className="masthead">
          <div>
            <m.p className="eyebrow" variants={introEyebrowVariants}>极乐迪斯科文本侧写台 / 案卷 01</m.p>
            <m.div className="title-reveal" variants={introTitleVariants}>
              <h1>极乐迪斯科｜内陆回声</h1>
            </m.div>
          </div>
          <m.div className="masthead-note" variants={introNoteVariants}>
            <span className="live-dot" aria-hidden="true" />
            <p>原意留在现场，语气负责留下指纹。</p>
          </m.div>
        </header>

        <m.section className="control-strip" aria-label="改写设置" variants={introControlsVariants}>
          <m.div className="control-group style-control" variants={introControlItemVariants}>
            <span className="control-label">叙事频段</span>
            <div className="segmented" role="radiogroup" aria-label="选择改写风格">
              {STYLE_PRESETS.map((preset) => {
                const selected = style === preset.id;
                return (
                  <m.button
                    key={preset.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    className={selected ? "selected" : ""}
                    onClick={() => {
                      setStyle(preset.id);
                      clearCheckResult();
                    }}
                    disabled={isGenerating}
                    whileTap={isGenerating ? undefined : { y: 1 }}
                  >
                    <span>{preset.shortLabel}</span>
                    {selected ? (
                      <m.i
                        className="style-indicator"
                        layoutId="style-indicator"
                        transition={MECHANICAL_SPRING}
                        aria-hidden="true"
                      />
                    ) : null}
                  </m.button>
                );
              })}
            </div>
            <p>{selectedStyle.description}</p>
          </m.div>

          <m.div className="control-group provider-control" variants={introControlItemVariants}>
            <div className="provider-heading">
              <span className="control-label">模型线路 · {selectedIds.length}/3</span>
              <button
                ref={customToggleRef}
                type="button"
                className="text-button custom-toggle"
                onClick={() => setShowCustom((value) => !value)}
                disabled={isGenerating}
                aria-expanded={showCustom}
                aria-controls="custom-provider-fields"
              >
                <span className="custom-symbol" aria-hidden="true">{showCustom ? "−" : "+"}</span>
                {showCustom ? "收起自定义" : "自定义线路"}
              </button>
            </div>
            <div className="provider-list">
              {providers.map((provider) => {
                const selected = selectedIds.includes(provider.id);
                return (
                  <div
                    key={provider.id}
                    className={`provider-option ${selected ? "selected" : ""}`}
                    data-selected={selected}
                  >
                    <label>
                      <input
                        type="checkbox"
                        name="provider"
                        value={provider.id}
                        checked={selected}
                        onChange={() => toggleProvider(provider.id)}
                        disabled={isGenerating}
                      />
                      <span className="provider-check" aria-hidden="true" />
                      <span>
                        <b>{provider.label}</b>
                        <small>{provider.model}</small>
                      </span>
                    </label>
                    {!provider.builtin ? (
                      <button
                        type="button"
                        className="remove-provider"
                        onClick={() => removeCustomProvider(provider.id)}
                        disabled={isGenerating}
                        aria-label={`移除 ${provider.label}`}
                      >
                        ×
                      </button>
                    ) : null}
                    <i className={provider.configured ? "ready" : "needs-key"}>
                      {provider.configured ? "就绪" : "需密钥"}
                    </i>
                  </div>
                );
              })}
            </div>
          </m.div>
        </m.section>

        <AnimatePresence initial={false}>
          {showCustom ? (
            <m.section
              id="custom-provider-fields"
              className="custom-provider"
              aria-label="添加自定义供应商"
              initial={reduceMotion ? false : "closed"}
              animate="open"
              exit="closed"
              variants={disclosureVariants}
              data-state="open"
            >
              <div>
                <label htmlFor="custom-label">显示名称</label>
                <input id="custom-label" name="custom-label" value={customLabel} onChange={(event) => setCustomLabel(event.target.value)} placeholder="例如 Moonshot…" autoComplete="off" disabled={isGenerating} />
              </div>
              <div>
                <label htmlFor="custom-url">OpenAI 兼容接口地址</label>
                <input id="custom-url" name="custom-url" type="url" value={customBaseUrl} onChange={(event) => setCustomBaseUrl(event.target.value)} placeholder="https://api.example.com/v1…" autoComplete="off" disabled={isGenerating} />
              </div>
              <div>
                <label htmlFor="custom-model">模型名称</label>
                <input id="custom-model" name="custom-model" value={customModel} onChange={(event) => setCustomModel(event.target.value)} placeholder="model-name…" autoComplete="off" spellCheck={false} disabled={isGenerating} />
              </div>
              <div>
                <label htmlFor="custom-key">临时接口密钥</label>
                <input id="custom-key" name="custom-key" type="password" value={customApiKey} onChange={(event) => setCustomApiKey(event.target.value)} placeholder="仅保存在当前页面内存…" autoComplete="off" spellCheck={false} disabled={isGenerating} />
              </div>
              <button type="button" className="add-provider" onClick={addCustomProvider} disabled={isGenerating}>接入线路</button>
            </m.section>
          ) : null}
        </AnimatePresence>

        {selectedProviders.some((provider) => !provider.configured && provider.builtin) ? (
          <section className="credential-row" aria-label="临时 API 密钥">
            {selectedProviders
              .filter((provider) => !provider.configured && provider.id !== "mock")
              .map((provider) => (
                <label key={provider.id}>
                  <span>{provider.label} 临时密钥</span>
                  <input
                    type="password"
                    name={`api-key-${provider.id}`}
                    value={apiKeys[provider.id] || ""}
                    onChange={(event) =>
                      setApiKeys((current) => ({ ...current, [provider.id]: event.target.value }))
                    }
                    placeholder="不会写入浏览器存储或日志…"
                    autoComplete="off"
                    spellCheck={false}
                    disabled={isGenerating}
                  />
                </label>
              ))}
          </section>
        ) : null}

        <CheckPanel
          value={check}
          onChange={(next) => {
            setCheck(next);
            clearCheckResult();
          }}
          disabled={isGenerating}
          diceState={diceState}
          result={checkResult}
        />

        <m.section className="work-surface" variants={introSurfaceVariants}>
          <m.div className="input-pane" variants={introSurfacePartVariants} custom={0}>
            <div className="pane-heading">
              <div>
                <span className="pane-index">甲</span>
                <h2>现场口供</h2>
              </div>
              <span className={text.length > 900 ? "character-count warning" : "character-count"}>
                {text.length} / 1000
              </span>
            </div>
            <textarea
              name="source-text"
              autoComplete="off"
              value={text}
              onChange={(event) => {
                setText(event.target.value);
                clearCheckResult();
              }}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                  event.preventDefault();
                  void generate();
                }
              }}
              maxLength={1000}
              placeholder="把一句解释、一段对白，或一件难以启齿的小事留在这里……"
              aria-label="需要改写的原文"
              disabled={isGenerating}
            />
            <div className="sample-row">
              <span>取样</span>
              {SAMPLES.map((sample, index) => (
                <button key={sample} type="button" disabled={isGenerating} onClick={() => {
                  setText(sample);
                  clearCheckResult();
                }}>
                  {String(index + 1).padStart(2, "0")}
                </button>
              ))}
            </div>
          </m.div>

          <m.div className="seam" aria-hidden="true" variants={introSurfacePartVariants} custom={2}>
            <span>改写</span>
          </m.div>

          <m.div className="output-pane" aria-live="polite" variants={introSurfacePartVariants} custom={1}>
            <div className="pane-heading">
              <div>
                <span className="pane-index">乙</span>
                <h2>侧写记录</h2>
              </div>
              <span className={isGenerating ? "signal active" : "signal"}>
                {isGenerating ? "信号接入" : "等待输入"}
              </span>
            </div>

            {resultOrder.length === 0 ? (
              <div className="empty-output">
                <div className="echo-rings" aria-hidden="true"><i /><i /><i /></div>
                <p>选择线路，然后开始侧写。</p>
                <small>不同模型的结果会在这里并列出现。</small>
              </div>
            ) : (
              <div className={`results-grid count-${resultOrder.length}`}>
                {resultOrder.map((id, index) => {
                  const output = outputs[id];
                  if (!output) return null;
                  const copied = copiedId === id;
                  return (
                    <m.article
                      className={`result ${output.status}`}
                      key={id}
                      data-state={output.status}
                      initial={reduceMotion ? false : { opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{
                        duration: reduceMotion ? 0.08 : MOTION_DURATION.base,
                        delay: reduceMotion ? 0 : index * 0.05,
                        ease: MOTION_EASE.enter,
                      }}
                    >
                      <header>
                        <div>
                          <span>{output.label}</span>
                          <small>{statusLabel(output.status)}</small>
                        </div>
                        <button type="button" onClick={() => void copyOutput(id)} disabled={!output.text}>
                          <span className="copy-label">
                            <AnimatePresence initial={false} mode="wait">
                              <m.span
                                key={copied ? "copied" : "copy"}
                                initial={reduceMotion ? false : { opacity: 0, y: 2 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={reduceMotion ? undefined : { opacity: 0, y: -2 }}
                                transition={{ duration: reduceMotion ? 0.08 : MOTION_DURATION.instant }}
                              >
                                {copied ? "已复制" : "复制"}
                              </m.span>
                            </AnimatePresence>
                          </span>
                        </button>
                      </header>
                      {output.error ? <p className="result-error">{output.error}</p> : null}
                      <div className="result-text">
                        {output.text || (output.status === "streaming" ? "正在建立语言模型连接…" : "")}
                        {output.status === "streaming" ? <span className="cursor" aria-hidden="true" /> : null}
                      </div>
                    </m.article>
                  );
                })}
              </div>
            )}
          </m.div>
        </m.section>

        <m.footer className="action-bar" variants={introActionVariants}>
          <div>
            <p className={error ? "form-message error" : "form-message"} role="status">
              {error || "快捷键：⌘ / Ctrl + Enter"}
            </p>
            <small>密钥仅随本次请求发送；服务端不会记录正文或密钥。</small>
          </div>
          <AnimatePresence initial={false} mode="popLayout">
            {isGenerating ? (
              <m.button
                key="stop"
                type="button"
                className="primary-action stop generating"
                onClick={stop}
                initial={reduceMotion ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                whileTap={{ y: 1, scale: 0.99 }}
                transition={{ duration: reduceMotion ? 0.08 : MOTION_DURATION.fast }}
              >
                <span>{check.enabled && diceState === "rolling" ? "正在判定 · 点击停止" : "停止接收"}</span><b aria-hidden="true">■</b>
              </m.button>
            ) : (
              <m.button
                key="start"
                type="button"
                className="primary-action"
                onClick={() => void generate()}
                initial={reduceMotion ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                whileTap={{ y: 1, scale: 0.99 }}
                transition={{ duration: reduceMotion ? 0.08 : MOTION_DURATION.fast }}
              >
                <span>{check.enabled ? "投骰并开始侧写" : "开始侧写"}</span><b aria-hidden="true">↗</b>
              </m.button>
            )}
          </AnimatePresence>
        </m.footer>
      </section>
    </PageIntro>
  );
}
