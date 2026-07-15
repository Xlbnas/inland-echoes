"use client";

import { useMemo, useRef, useState } from "react";
import { STYLE_PRESETS } from "@/lib/styles";
import type {
  ProviderOutput,
  ProviderRequest,
  PublicProvider,
  RewriteEvent,
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

const CHANNELS = ["逻辑", "共情", "直觉", "镇定", "反应", "想象"];

function statusLabel(status: ProviderOutput["status"]) {
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
  const [text, setText] = useState("");
  const [style, setStyle] = useState<StyleId>("inner_monologue");
  const [providers, setProviders] = useState<ClientProvider[]>(initialProviders);
  const [selectedIds, setSelectedIds] = useState<string[]>(["mock"]);
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
  const [outputs, setOutputs] = useState<Record<string, ProviderOutput>>({});
  const [resultOrder, setResultOrder] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState("");
  const [showCustom, setShowCustom] = useState(false);
  const [customLabel, setCustomLabel] = useState("");
  const [customBaseUrl, setCustomBaseUrl] = useState("");
  const [customModel, setCustomModel] = useState("");
  const [customApiKey, setCustomApiKey] = useState("");
  const abortRef = useRef<AbortController | null>(null);

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
    setCustomLabel("");
    setCustomBaseUrl("");
    setCustomModel("");
    setCustomApiKey("");
    setShowCustom(false);
  }

  function removeCustomProvider(id: string) {
    setProviders((current) => current.filter((provider) => provider.id !== id));
    setSelectedIds((current) => {
      const next = current.filter((item) => item !== id);
      return next.length > 0 ? next : ["mock"];
    });
  }

  function parseEvent(line: string) {
    if (!line.trim()) return;
    const event = JSON.parse(line) as RewriteEvent;
    setOutputs((current) => {
      const previous = current[event.providerId] || {
        label: event.providerId,
        text: "",
        status: "idle" as const,
      };

      if (event.type === "provider_start") {
        return {
          ...current,
          [event.providerId]: {
            label: event.label,
            text: "",
            status: "streaming",
          },
        };
      }
      if (event.type === "provider_delta") {
        return {
          ...current,
          [event.providerId]: {
            ...previous,
            text: previous.text + event.delta,
            status: "streaming",
          },
        };
      }
      if (event.type === "provider_done") {
        return {
          ...current,
          [event.providerId]: { ...previous, status: "done" },
        };
      }
      return {
        ...current,
        [event.providerId]: {
          ...previous,
          status: "error",
          error: event.message,
        },
      };
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

    const order = requests.map((provider) => provider.id);
    setResultOrder(order);
    setOutputs(
      Object.fromEntries(
        requests.map((provider) => [
          provider.id,
          { label: provider.label, text: "", status: "idle" },
        ]),
      ),
    );
    setIsGenerating(true);
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch("/api/rewrite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: source, style, providers: requests }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || `请求失败（${response.status}）`);
      }
      if (!response.body) throw new Error("服务器没有返回内容");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) parseEvent(line);
        if (done) break;
      }
      if (buffer.trim()) parseEvent(buffer);
    } catch (requestError) {
      if (requestError instanceof DOMException && requestError.name === "AbortError") {
        setError("生成已停止");
      } else {
        setError(requestError instanceof Error ? requestError.message : "生成失败");
      }
    } finally {
      abortRef.current = null;
      setIsGenerating(false);
    }
  }

  function stop() {
    abortRef.current?.abort();
  }

  async function copyOutput(id: string) {
    const output = outputs[id]?.text;
    if (!output) return;
    await navigator.clipboard.writeText(output);
  }

  return (
    <main className="shell">
      <aside className="channel-rail" aria-label="意识频道状态">
        <div className="rail-mark" aria-hidden="true">极乐</div>
        <div className="rail-line" aria-hidden="true" />
        <ol>
          {CHANNELS.map((channel, index) => (
            <li key={channel} className={isGenerating && index % 2 === 0 ? "active" : ""}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <b>{channel}</b>
            </li>
          ))}
        </ol>
        <div className="rail-frequency" aria-hidden="true">88.4</div>
      </aside>

      <section className="workspace">
        <header className="masthead">
          <div>
            <p className="eyebrow">极乐迪斯科文本侧写台 / 案卷 01</p>
            <h1>极乐迪斯科｜内陆回声</h1>
          </div>
          <div className="masthead-note">
            <span className="live-dot" />
            <p>原意留在现场，语气负责留下指纹。</p>
          </div>
        </header>

        <section className="control-strip" aria-label="改写设置">
          <div className="control-group style-control">
            <span className="control-label">叙事频段</span>
            <div className="segmented" role="radiogroup" aria-label="选择改写风格">
              {STYLE_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  role="radio"
                  aria-checked={style === preset.id}
                  className={style === preset.id ? "selected" : ""}
                  onClick={() => setStyle(preset.id)}
                  disabled={isGenerating}
                >
                  {preset.shortLabel}
                </button>
              ))}
            </div>
            <p>{selectedStyle.description}</p>
          </div>

          <div className="control-group provider-control">
            <div className="provider-heading">
              <span className="control-label">模型线路 · {selectedIds.length}/3</span>
              <button type="button" className="text-button" onClick={() => setShowCustom((value) => !value)}>
                {showCustom ? "收起自定义" : "+ 自定义线路"}
              </button>
            </div>
            <div className="provider-list">
              {providers.map((provider) => {
                const selected = selectedIds.includes(provider.id);
                return (
                  <div key={provider.id} className={`provider-option ${selected ? "selected" : ""}`}>
                    <label>
                      <input
                        type="checkbox"
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
          </div>
        </section>

        {showCustom ? (
          <section className="custom-provider" aria-label="添加自定义供应商">
            <div>
              <label htmlFor="custom-label">显示名称</label>
              <input id="custom-label" value={customLabel} onChange={(event) => setCustomLabel(event.target.value)} placeholder="例如 Moonshot" />
            </div>
            <div>
              <label htmlFor="custom-url">OpenAI 兼容接口地址</label>
              <input id="custom-url" value={customBaseUrl} onChange={(event) => setCustomBaseUrl(event.target.value)} placeholder="https://api.example.com/v1" />
            </div>
            <div>
              <label htmlFor="custom-model">模型名称</label>
              <input id="custom-model" value={customModel} onChange={(event) => setCustomModel(event.target.value)} placeholder="model-name" />
            </div>
            <div>
              <label htmlFor="custom-key">临时接口密钥</label>
              <input id="custom-key" type="password" value={customApiKey} onChange={(event) => setCustomApiKey(event.target.value)} placeholder="仅保存在当前页面内存" autoComplete="off" />
            </div>
            <button type="button" className="add-provider" onClick={addCustomProvider}>接入线路</button>
          </section>
        ) : null}

        {selectedProviders.some((provider) => !provider.configured && provider.builtin) ? (
          <section className="credential-row" aria-label="临时 API 密钥">
            {selectedProviders
              .filter((provider) => !provider.configured && provider.id !== "mock")
              .map((provider) => (
                <label key={provider.id}>
                  <span>{provider.label} 临时密钥</span>
                  <input
                    type="password"
                    value={apiKeys[provider.id] || ""}
                    onChange={(event) =>
                      setApiKeys((current) => ({ ...current, [provider.id]: event.target.value }))
                    }
                    placeholder="不会写入浏览器存储或日志"
                    autoComplete="off"
                  />
                </label>
              ))}
          </section>
        ) : null}

        <section className="work-surface">
          <div className="input-pane">
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
              value={text}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                  event.preventDefault();
                  void generate();
                }
              }}
              maxLength={1000}
              placeholder="把一句解释、一段对白，或一件难以启齿的小事留在这里……"
              aria-label="需要改写的原文"
            />
            <div className="sample-row">
              <span>取样</span>
              {SAMPLES.map((sample, index) => (
                <button key={sample} type="button" onClick={() => setText(sample)}>
                  {String(index + 1).padStart(2, "0")}
                </button>
              ))}
            </div>
          </div>

          <div className="seam" aria-hidden="true">
            <span>改写</span>
          </div>

          <div className="output-pane" aria-live="polite">
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
                {resultOrder.map((id) => {
                  const output = outputs[id];
                  if (!output) return null;
                  return (
                    <article className={`result ${output.status}`} key={id}>
                      <header>
                        <div>
                          <span>{output.label}</span>
                          <small>{statusLabel(output.status)}</small>
                        </div>
                        <button type="button" onClick={() => void copyOutput(id)} disabled={!output.text}>
                          复制
                        </button>
                      </header>
                      {output.error ? <p className="result-error">{output.error}</p> : null}
                      <div className="result-text">
                        {output.text || (output.status === "streaming" ? "正在建立语言模型连接…" : "")}
                        {output.status === "streaming" ? <span className="cursor" aria-hidden="true" /> : null}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        <footer className="action-bar">
          <div>
            <p className={error ? "form-message error" : "form-message"} role="status">
              {error || "快捷键：⌘ / Ctrl + Enter"}
            </p>
            <small>密钥仅随本次请求发送；服务端不会记录正文或密钥。</small>
          </div>
          {isGenerating ? (
            <button type="button" className="primary-action stop" onClick={stop}>
              <span>停止接收</span><b>■</b>
            </button>
          ) : (
            <button type="button" className="primary-action" onClick={() => void generate()}>
              <span>开始侧写</span><b>↗</b>
            </button>
          )}
        </footer>
      </section>
    </main>
  );
}
