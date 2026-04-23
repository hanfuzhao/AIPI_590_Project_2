const TOOLS = [
  { type: "function", function: {
    name: "change_symbol",
    description: "切换图表的交易品种和/或时间周期。例：symbol='BINANCE:BTCUSDT', interval='15'",
    parameters: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "带交易所前缀的完整代码，如 BINANCE:BTCUSDT / NASDAQ:AAPL / FX:EURUSD" },
        interval: { type: "string", enum: ["1","5","15","60","240","D","W"], description: "时间周期" }
      },
      required: ["symbol"]
    }
  }},
  { type: "function", function: {
    name: "add_study",
    description: "添加技术指标。name 必须是 TradingView 完整英文名，如 'Relative Strength Index'/'Volume'/'MACD'/'Moving Average Exponential'/'Bollinger Bands'/'Stochastic RSI'",
    parameters: {
      type: "object",
      properties: { name: { type: "string" } },
      required: ["name"]
    }
  }},
  { type: "function", function: {
    name: "remove_all_studies",
    description: "移除图表上所有技术指标",
    parameters: { type: "object", properties: {} }
  }},
  { type: "function", function: {
    name: "add_comparison",
    description: "叠加另一个品种到当前图表做走势对比",
    parameters: {
      type: "object",
      properties: { symbol: { type: "string" } },
      required: ["symbol"]
    }
  }},
  { type: "function", function: {
    name: "draw_levels",
    description: "画水平线。最常用于入场(entry)/止损(SL)/目标(TP)/支撑/阻力。颜色约定：#22c55e=绿(多/支撑/入场), #ef4444=红(空/止损/阻力), #3b82f6=蓝(目标)。",
    parameters: {
      type: "object",
      properties: {
        levels: {
          type: "array",
          items: {
            type: "object",
            properties: {
              price: { type: "number" },
              label: { type: "string" },
              color: { type: "string" },
              style: { type: "string", enum: ["dashed", "solid"] },
              linewidth: { type: "number" }
            },
            required: ["price", "label", "color"]
          }
        },
        kind: { type: "string", enum: ["entry_sl_tp"] },
        clear_existing: { type: "boolean" }
      },
      required: ["levels", "kind"]
    }
  }},
  { type: "function", function: {
    name: "remove_all_drawings",
    description: "清空图表上所有画线/形状",
    parameters: { type: "object", properties: {} }
  }},
  { type: "function", function: {
    name: "pt_place_order",
    description: "在 TradingView Paper Trading 纸盘账户挂单。注意：这是模拟盘，不涉及真实资金。用户必须已开通 TV Paper Trading 账户。",
    parameters: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["limit","market","stop","stop_limit"], description: "订单类型" },
        symbol: { type: "string", description: "交易品种代码" },
        side: { type: "string", enum: ["buy","sell"] },
        qty: { type: "number", description: "数量" },
        price: { type: "number", description: "限价，type=limit/stop_limit 时必填" },
        tp: { type: "number", description: "止盈 Take Profit" },
        sl: { type: "number", description: "止损 Stop Loss" }
      },
      required: ["type", "symbol", "side", "qty"]
    }
  }},
  { type: "function", function: {
    name: "pt_cancel_order",
    description: "取消 Paper Trading 订单",
    parameters: {
      type: "object",
      properties: { order_id: { type: "string" } },
      required: ["order_id"]
    }
  }},
  { type: "function", function: {
    name: "pt_close_position",
    description: "平 Paper Trading 仓位",
    parameters: {
      type: "object",
      properties: { symbol: { type: "string" } },
      required: ["symbol"]
    }
  }},
  { type: "function", function: {
    name: "pt_get_account",
    description: "查询 Paper Trading 账户（余额、持仓、挂单）",
    parameters: { type: "object", properties: {} }
  }},
  { type: "function", function: {
    name: "take_screenshot",
    description: "截取当前图表的 PNG 图片（base64）",
    parameters: {
      type: "object",
      properties: { include_legend: { type: "boolean" } }
    }
  }},
  { type: "function", function: {
    name: "tv_api_call",
    description: "调用任意其他 TradingView Remix bridge API action。SYSTEM PROMPT 里列出了所有可用 action 名字和参数格式，需要用到除上面核心 tool 之外的 action 时用这个。",
    parameters: {
      type: "object",
      properties: {
        action: { type: "string", description: "action 名字，如 'remove_study'/'set_visible_range'/'pt_list_accounts'/'create_shape'/'set_chart_type' 等" },
        params: { type: "object", description: "该 action 的参数对象" }
      },
      required: ["action"]
    }
  }}
];

const SYSTEM_PROMPT = `你是 **资深交易员 + TradingView 操作助手**。每次对话开始会注入完整的图表 context JSON（含品种、K 线、指标、基本面、技术评级、Paper Trading 账户、策略回测等 33+ 维度数据）。

## 你的工作方式
你有 function calling 能力，可以多轮调用 tools。思路：**先看 context 里已有数据 → 只补调缺失且已验证可用的 action → 再分析 → 再画图/下单**。

## 【非常重要】Bridge 能力白名单
context 里有 \`_bridge_capabilities\` 字段，里面的 \`verified_available\` 是**这次实际 postMessage 测试通过的 action 名单**；\`verified_unavailable\` 是调不通的（Remix 内部逻辑没暴露给 MAIN world bridge，调了必然 timeout/error）。

**规则**：
- ❌ **绝对不要**调 \`verified_unavailable\` 里的任何 action
- ✅ \`verified_available\` 里的 getter 已经在 context 里提供过结果了，**不需要再显式调用重复拉取**，直接读 context 对应字段（如 context.ohlcv / context.symbol_info / context.quote / context.fundamentals / context.technicals_rating / context.earnings_calendar / context.economic_calendar）即可
- ✅ 操作类 action（change_symbol / add_study / draw_levels / remove_all_studies / remove_all_drawings / pt_place_order / pt_get_account 等）不在 CONTEXT_ACTIONS 首轮 getter 里、但已知 bridge 支持，放心调用
- ⚠️ 其他没在白名单也没在黑名单里的 action 可以**尝试**调一次，失败就换方案不要重试

**已知名字坑**：
- Remix bridge 把 \`get_fundamentals\` 重命名成 \`get_financials\` 对外暴露。**通过 bridge 调时用 \`get_financials\`**（需要 {symbol} 参数），不是 \`get_fundamentals\`。
- \`get_quote\` / \`get_technicals_rating\` / \`get_financials\` 都**必须传 symbol 参数**，否则返回 "No symbol provided"。
- \`get_quotes_batch\` 必须传 \`symbols:[...]\` 数组。
- \`get_strategy_report\` 不在 bridge，调了必失败。策略数据用 \`get_strategies\` / \`get_strategy_trades\` / \`get_strategy_equity\` / \`get_strategy_inputs\` 代替。

## 什么时候需要显式调 tool
1. **用户要求操作图表**（画线/加指标/切品种）→ 调对应操作类 tool
2. **context 里 ohlcv 不够长** → tv_api_call({action:"get_ohlcv_bars", params:{count:200}}) 拉更多历史
3. **需要指标精确值** → tv_api_call({action:"get_study_values", params:{study_id}})（从 context.studies_list 取 id）
4. **用户要下单/查账户** → pt_get_account 然后 pt_place_order
5. **纯分析请求** → 如果 context 数据够用，直接基于 context 分析即可，不用硬凑调用

## 典型流程
1. 【读 context】先看 context 已有数据（ohlcv / studies_list / symbol_info / \_summary 等）能否支撑分析
2. 【按需补调】仅在 context 不够时才调 verified_available 里的 getter，不刷屏
3. 【分析】基于 context + 补调数据做专业分析，引用具体数值（当前价、EMA、RSI、高低点等）
4. 【可视化】add_study / draw_levels 把分析结果画到图上
5. 【下单】（如用户要求）pt_get_account → pt_place_order
6. 【总结回复】给出 Markdown 格式的最终方案

## 输出风格（严格遵守）
用 **Markdown** 格式，模仿资深交易员的专业输出：

- **多档位方案**：激进/稳健/深度分档，用**表格**展示（档位、价格、仓位、止损、目标、理由）
- **Emoji 分节**：🎯 目标 · 📉 做多 · 📈 做空 · ⚡ 执行要点 · ⚠️ 风险提示 · ✅ 已完成 · 💰 仓位 · 📊 汇总
- **具体数字**：价位精确到 TV 报价单位，仓位算出 BTC/股数，风险用美元金额
- **R:R 盈亏比**：任何方案必须算出盈亏比
- **执行清单**：步骤化，用户可直接照着操作
- 禁止"关注支撑阻力"这种空话，必须给**可执行价位**

## 举例输出（参考 Remix 风格）
### 📉 逢低做多（Buy Limit）
| 档位 | 价格 | 仓位 | 止损 | 目标 | 理由 |
|---|---|---|---|---|---|
| 激进 | $74,800 | 30% | $73,800 | $77,500 | 今日低点下方，短线反弹 |
| 稳健 | $74,000 | 50% | $72,500 | $78,000 | 前支撑 + EMA20 |

### ⚡ 执行要点
- **有效期**：GTC，周日 23:00 检查
- **优先挂单**：Buy $74,000（最可能成交）
- **仓位控制**：单笔 ≤ 账户 1%

## 可用 Actions（catch-all tv_api_call 使用以下 action 名）

### 导航
change_symbol · set_visible_range{from_timestamp,to_timestamp} · scroll_to_realtime · set_chart_type{chart_type:candle|line|area|bars|heiken-ashi} · zoom_in · zoom_out · fullscreen{enabled}

### 数据
get_chart_data{count} · get_ohlcv_bars{count} · get_quote · get_quotes_batch{symbols[]} · get_study_values{study_id} · get_study_info{study_id} · get_fundamentals{keys[]} · get_earnings_calendar · get_economic_calendar

### 绘图
create_shape{point:{time,price},shape:"text"|"arrow_up"|"arrow_down"|"flag"|"note",text} · create_multipoint_shape{points:[{time,price}],shape:"trend_line"|"rectangle"|"fib_retracement"|"parallel_channel"|"horizontal_line"} · create_anchored_shape · get_drawing_properties{drawing_id} · set_drawing_properties{drawing_id,properties} · set_drawing_points{drawing_id,points} · remove_drawing{drawing_id} · toggle_drawings_visibility{hidden} · lock_drawings{locked} · select_drawing_tool{tool} · list_drawings

### 指标
remove_study{study_id} · list_studies · get_pine_drawings

### 对比
remove_comparison{comparison_id} · remove_all_comparisons · list_comparisons

### Pine Script
pine_open_editor · pine_set_script{code} · pine_read_script · pine_edit_script{old_text,new_text} · pine_get_errors · pine_add_to_chart

### 布局/同步
set_chart_layout{layout:single|2h|2v|3s|4} · set_active_chart{index} · set_symbol_sync{enabled} · set_crosshair_sync{enabled} · set_date_range_sync{enabled}

### 策略回测
get_strategies · get_strategy_inputs · set_strategy_input{input_id,value} · get_strategy_report · get_strategy_trades · get_strategy_equity · goto_trade{timestamp}

### Paper Trading（完整 12 个）
pt_modify_order{order_id,...} · pt_reverse_position{symbol} · pt_modify_position{symbol,tp,sl} · pt_create_account · pt_reset_account · pt_list_accounts · pt_get_orders_history · pt_get_trades

### Portfolio（投资组合）
pf_create_portfolio · pf_list_portfolios · pf_get_portfolio{portfolio_id} · pf_get_holdings · pf_get_summary · pf_get_analysis · pf_add_transaction · pf_add_cash_transaction · pf_get_transactions

### UI/其他
open_indicators_dialog · open_settings_dialog · close_popups · save_chart · load_chart{chart_id} · run_screener · undo · redo · set_theme{theme:light|dark} · refresh_news · set_magnet_mode{enabled}

## 时间单位
所有 time/timestamp 字段统一用 **unix 秒**（非毫秒）。

## 关键原则
1. **严格遵守 Bridge 白名单** - 只调 verified_available 里的 getter + 已知可用的操作类 action，**绝不调 verified_unavailable**
2. **不要瞎编数据** - context 里如果某字段是 \`{_error: "..."}\` 表示这个 action 在当前环境调不到（可能没登录 / 没策略 / 没权限），**绝不要硬编数据**，老实说"当前无此数据"
3. **分析要数据化** - 每个建议都要基于 context 里的具体数值（价格、指标值、高低点）
4. **新闻只给了摘要** - \`context.news.items\` 里每条 body 截到 500 字符。需要看某条全文时调 \`tv_api_call({action:"get_news_story", params:{story_id:"<id>"}})\`
5. **OHLCV 数据位置** - \`context._summary.recentBars\` 里有最近 30 根 K 线（原始 300 根中取最后 30）；\`_summary.highInWindow/lowInWindow/priceChangePctInWindow\` 基于完整 300 根计算，是更准确的窗口统计
6. **Paper Trading 前先确认** - pt_place_order 之前问清楚用户账户规模和风险偏好
7. **记住上下文** - 有对话历史时，要记得之前说过的账户资金、已画的线、已挂的单
8. **失败不重试同一参数** - 如果 tool 返回 error，换参数或换 action，别死循环`;

const MAX_ITERATIONS = 8;

const LANG_DIRECTIVE = {
  zh: '【语言要求】全程使用简体中文回答，包括表格、清单、解释。',
  en: '【Language】Respond entirely in English, including tables, lists, and explanations.',
};

async function runAgent(userHistory, apiKey, lang = 'zh') {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url?.includes('tradingview.com/chart')) {
    throw new Error('请先打开 TradingView 图表页面');
  }

  let context;
  try {
    context = await chrome.tabs.sendMessage(tab.id, { type: 'GET_CONTEXT' });
  } catch (e) {
    throw new Error('无法连接到 TradingView 页面的 content script。请刷新一下当前的 TV 图表页（Cmd+R），再试一次。错误详情：' + e.message);
  }
  if (!context) throw new Error('Content script 返回空 context，可能 Remix bridge 还没加载好，稍等几秒重试');

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'system', content: LANG_DIRECTIVE[lang] || LANG_DIRECTIVE.zh },
    { role: 'system', content: `【当前图表 Context（自动注入，每次请求刷新）】\n${JSON.stringify(context, null, 2)}` },
    ...userHistory
  ];

  const toolRounds = [];

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    const resp = await callOpenAI(messages, apiKey);
    const msg = resp.choices[0].message;
    messages.push(msg);

    if (!msg.tool_calls?.length) {
      return { reply: msg.content || '(no reply)', toolRounds };
    }

    const roundResults = [];
    for (const call of msg.tool_calls) {
      let args = {};
      try { args = JSON.parse(call.function.arguments || '{}'); } catch {}

      const isCatchAll = call.function.name === 'tv_api_call';
      const action = isCatchAll ? args.action : call.function.name;
      const params = isCatchAll ? (args.params || {}) : args;

      let execResult;
      try {
        const execResults = await chrome.tabs.sendMessage(tab.id, {
          type: 'EXECUTE_ACTIONS',
          actions: [{ action, params }]
        });
        execResult = execResults?.[0] || { success: false, data: 'content script returned empty' };
      } catch (e) {
        execResult = { success: false, data: 'TV 页面 content script 失联，建议刷新后重试: ' + e.message };
      }

      roundResults.push({
        action,
        success: !!execResult.success,
        data: execResult.data
      });

      let resultStr = JSON.stringify(execResult);
      if (resultStr.length > 3000) resultStr = resultStr.slice(0, 3000) + '…(truncated)';

      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        content: resultStr
      });
    }
    toolRounds.push({ iteration: iter + 1, results: roundResults });
  }

  return {
    reply: '(达到最大 ' + MAX_ITERATIONS + ' 轮迭代，仍未给出最终回复)',
    toolRounds
  };
}

async function callOpenAI(messages, apiKey) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      max_tokens: 8000,
      tools: TOOLS,
      tool_choice: 'auto',
      messages
    })
  });

  const data = await response.json();
  if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
  return data;
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'CHAT') {
    (async () => {
      try {
        const { apiKey } = await chrome.storage.local.get('apiKey');
        if (!apiKey) {
          sendResponse({ error: '请先在 Settings 里配置 OpenAI API Key' });
          return;
        }

        const history = Array.isArray(msg.history) ? msg.history : [];
        const result = await runAgent(history, apiKey, msg.lang);
        sendResponse(result);
      } catch (e) {
        console.error('[TV Agent]', e);
        sendResponse({ error: e.message });
      }
    })();
    return true;
  }
});

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);

console.log('[MyTVAgent] Background worker loaded');
