function callTV(action, params = {}) {
  return new Promise((resolve) => {
    const id = 'myagent-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9);

    const handler = (e) => {
      if (e.data?.type === 'TVREMIX_API_RESPONSE' && e.data?.id === id) {
        window.removeEventListener('message', handler);
        resolve(e.data);
      }
    };
    window.addEventListener('message', handler);

    window.postMessage({
      type: 'TVREMIX_API_REQUEST',
      id,
      action,
      params
    }, '*');

    setTimeout(() => {
      window.removeEventListener('message', handler);
      resolve({ success: false, error: 'timeout' });
    }, 10000);
  });
}

const CONTEXT_ACTIONS = [
  ['symbol_info',          'get_symbol_info'],
  ['symbol_interval',      'get_symbol_interval'],
  ['user_info',            'get_user_info'],
  ['ohlcv',                'get_ohlcv_bars', { count: 300 }],
  ['chart_type',           'get_chart_type'],
  ['visible_range',        'get_visible_range'],
  ['available_intervals',  'get_available_intervals'],
  ['magnet_mode',          'get_magnet_mode'],
  ['theme',                'get_theme'],
  ['selected_drawing_tool','get_selected_drawing_tool'],
  ['undo_redo_state',      'get_undo_redo_state'],
  ['unsaved_changes',      'has_unsaved_changes'],
  ['layout_info',          'get_layout_info'],
  ['layout_name',          'get_layout_name'],
  ['all_charts_state',     'get_all_charts_state'],
  ['saved_charts',         'get_saved_charts'],
  ['study_values',         'get_all_study_values'],
  ['indicator_values',     'get_indicator_values'],
  ['studies_list',         'list_studies'],
  ['drawings_list',        'list_drawings'],
  ['comparisons_list',     'list_comparisons'],
  ['economic_calendar',    'get_economic_calendar'],
  ['watchlists',           'get_all_watchlists'],
  ['flagged_lists',        'get_flagged_lists'],
  ['pine_script',          'pine_read_script'],
  ['pine_errors',          'pine_get_errors'],
  ['strategies',           'get_strategies'],
  ['strategy_inputs',      'get_strategy_inputs'],
  ['strategy_trades',      'get_strategy_trades'],
  ['strategy_equity',      'get_strategy_equity'],
];

const SYMBOL_ACTIONS = [
  ['quote',             'get_quote'],
  ['fundamentals',      'get_financials'],
  ['technicals_rating', 'get_technicals_rating'],
  ['earnings_calendar', 'get_earnings_calendar'],
  ['news',              'get_news'],
];

function extractIds(data, idKeys = ['id', 'study_id', 'drawing_id', 'entity_id', 'comparison_id']) {
  if (!data) return [];
  let arr = null;
  if (Array.isArray(data)) arr = data;
  else if (typeof data === 'object') {
    for (const k of Object.keys(data)) {
      if (Array.isArray(data[k])) { arr = data[k]; break; }
    }
  }
  if (!arr) return [];
  return arr.map(item => {
    if (typeof item === 'string' || typeof item === 'number') return item;
    if (typeof item !== 'object' || !item) return null;
    for (const k of idKeys) if (item[k] != null) return item[k];
    return null;
  }).filter(v => v != null);
}

const MAX_DETAIL_PER_LIST = 10;

function summarizeNews(data) {
  if (!data) return null;
  const items = Array.isArray(data) ? data : (data.items || data.news || data.stories || []);
  if (!Array.isArray(items) || !items.length) return data;
  const summarized = items.slice(0, 10).map(it => {
    const body = it.body || it.description || it.summary || it.shortDescription || it.content || '';
    return {
      id: it.id || it.story_id || it.storyPath,
      title: it.title || it.headline,
      published: it.published || it.publishedAt || it.date || it.time,
      source: it.source || it.provider || it.sourceLogoId,
      urgency: it.urgency,
      symbols: it.relatedSymbols || it.symbols,
      body: typeof body === 'string' && body.length > 500 ? body.slice(0, 500) + '…(full via get_news_story)' : body
    };
  });
  return { items: summarized, total: items.length, note: items.length > 10 ? `showing 10 of ${items.length}, call get_news_story({story_id}) for full text` : undefined };
}

function storeResult(ctx, key, result, transform) {
  if (result?.success) {
    const processed = transform ? transform(result.data) : result.data;
    ctx[key] = trim(processed);
  } else {
    ctx[key] = { _error: result?.error || 'unknown error' };
  }
}

function trim(v, maxArr = 30, maxStr = 2000, depth = 0) {
  if (v === null || v === undefined) return v;
  if (depth > 4) return '[deep-truncated]';
  if (typeof v === 'string') return v.length > maxStr ? v.slice(0, maxStr) + '…' : v;
  if (Array.isArray(v)) {
    const truncated = v.length > maxArr;
    return v.slice(0, maxArr).map(x => trim(x, maxArr, maxStr, depth + 1))
      .concat(truncated ? [`…(+${v.length - maxArr} more)`] : []);
  }
  if (typeof v === 'object') {
    const out = {};
    for (const k of Object.keys(v)) out[k] = trim(v[k], maxArr, maxStr, depth + 1);
    return out;
  }
  return v;
}

async function getChartContext() {
  const results = await Promise.all(
    CONTEXT_ACTIONS.map(([, action, params]) => callTV(action, params || {}))
  );

  const ctx = {};
  const availableActions = [];
  const unavailableActions = [];
  CONTEXT_ACTIONS.forEach(([key, action], i) => {
    const r = results[i];
    storeResult(ctx, key, r);
    if (r?.success) availableActions.push(action);
    else unavailableActions.push(action);
  });
  ctx._bridge_capabilities = {
    verified_available: availableActions,
    verified_unavailable: unavailableActions,
    note: 'verified_unavailable 里的 action 通过 bridge postMessage 调不到（Remix 内部可能有但没暴露给 MAIN world），别调用；其他未测试过的 action 可以尝试但可能失败'
  };

  const symbol = ctx.symbol_info?.full_name || ctx.symbol_info?.symbol || ctx.symbol_info?.ticker;
  if (symbol) {
    const symResults = await Promise.all(
      SYMBOL_ACTIONS.map(([, action]) => {
        const params = action === 'get_earnings_calendar'
          ? { symbols: [symbol], days_ahead: 14 }
          : { symbol };
        return callTV(action, params);
      })
    );
    SYMBOL_ACTIONS.forEach(([key, action], i) => {
      const r = symResults[i];
      storeResult(ctx, key, r, action === 'get_news' ? summarizeNews : undefined);
      if (r?.success) availableActions.push(action);
      else unavailableActions.push(action);
    });
  }

  const rawBars = results[CONTEXT_ACTIONS.findIndex(a => a[0] === 'ohlcv')]?.data?.bars || [];
  const first = rawBars[0], last = rawBars[rawBars.length - 1];
  const sInfo = ctx.symbol_info?._error ? {} : (ctx.symbol_info || {});
  const sInt = ctx.symbol_interval?._error ? {} : (ctx.symbol_interval || {});
  ctx._summary = {
    symbol: sInfo.full_name,
    description: sInfo.description,
    interval: sInt.interval,
    currentPrice: last?.close,
    priceChangePctInWindow: first && last ? ((last.close - first.close) / first.close * 100).toFixed(2) + '%' : null,
    highInWindow: rawBars.length ? Math.max(...rawBars.map(b => b.high)) : null,
    lowInWindow: rawBars.length ? Math.min(...rawBars.map(b => b.low)) : null,
    barsCount: rawBars.length,
    recentBars: rawBars.slice(-30)
  };
  if (ctx.ohlcv && !ctx.ohlcv._error) {
    const { bars, ...ohlcvMeta } = ctx.ohlcv;
    ctx.ohlcv = ohlcvMeta;
  }

  const studyIds    = extractIds(ctx.studies_list).slice(0, MAX_DETAIL_PER_LIST);
  const drawingIds  = extractIds(ctx.drawings_list).slice(0, MAX_DETAIL_PER_LIST);

  const detailCalls = [
    ...studyIds.flatMap(id => [
      callTV('get_study_info',   { study_id: id }),
      callTV('get_study_values', { study_id: id })
    ]),
    ...drawingIds.flatMap(id => [
      callTV('get_drawing_properties', { drawing_id: id }),
      callTV('get_drawing_points',     { drawing_id: id })
    ])
  ];

  if (detailCalls.length) {
    const detailResults = await Promise.all(detailCalls);
    let idx = 0;
    ctx.studies_detail = studyIds.map(id => {
      const info   = detailResults[idx++];
      const values = detailResults[idx++];
      return {
        id,
        info:   info?.success   ? trim(info.data)   : (info?.error   || null),
        values: values?.success ? trim(values.data) : (values?.error || null)
      };
    });
    ctx.drawings_detail = drawingIds.map(id => {
      const props  = detailResults[idx++];
      const points = detailResults[idx++];
      return {
        id,
        properties: props?.success  ? trim(props.data)  : (props?.error  || null),
        points:     points?.success ? trim(points.data) : (points?.error || null)
      };
    });
  }

  return ctx;
}

async function executeActions(actions) {
  const results = [];
  for (const action of actions) {
    try {
      const result = await callTV(action.action, action.params);
      results.push({
        action: action.action,
        success: result.success,
        data: result.data || result.error
      });
    } catch (e) {
      results.push({ action: action.action, success: false, error: e.message });
    }
  }
  return results;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'GET_CONTEXT') {
    getChartContext().then(sendResponse);
    return true;
  }
  if (msg.type === 'EXECUTE_ACTIONS') {
    executeActions(msg.actions).then(sendResponse);
    return true;
  }
});

console.log('[MyTVAgent] Content script loaded');
