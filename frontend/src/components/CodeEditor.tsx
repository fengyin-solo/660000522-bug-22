import React, { useState, useCallback, useEffect, useMemo } from 'react';
import Editor from '@monaco-editor/react';
import { useInterviewStore, ExecutionResult } from '../store/interview';
import { SubmissionResult } from './SubmissionResult';
import { LANGUAGE_CONFIGS, getLanguageConfig, LanguageConfig } from '../types';

interface CodeEditorProps {
  disabled?: boolean;
  onRun?: () => Promise<ExecutionResult>;
  onSubmit?: () => Promise<ExecutionResult>;
  showRunButton?: boolean;
  showSubmitButton?: boolean;
}

export const CodeEditor: React.FC<CodeEditorProps> = ({
  disabled = false,
  onRun,
  onSubmit,
  showRunButton = true,
  showSubmitButton = true,
}) => {
  const {
    code,
    setCode,
    language,
    setLanguage,
    originalCode,
    isRunning,
    isSubmitting,
    setIsRunning,
    setIsSubmitting,
    addExecutionHistory,
    updateExecutionHistory,
    currentProblem,
    executionHistory,
    activeHistoryId,
  } = useInterviewStore();

  const [languageConfirmOpen, setLanguageConfirmOpen] = useState(false);
  const [pendingLanguage, setPendingLanguage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [codeModified, setCodeModified] = useState(false);
  const [codeChangeIndicator, setCodeChangeIndicator] = useState(false);
  const [showLanguageDropdown, setShowLanguageDropdown] = useState(false);

  const langConfig = useMemo(() => getLanguageConfig(language), [language]);

  const codeChangeStats = useMemo(() => {
    if (!codeModified) return { added: 0, removed: 0, total: 0 };
    const originalLines = originalCode.split('\n');
    const currentLines = code.split('\n');
    const minLen = Math.min(originalLines.length, currentLines.length);
    let added = 0, removed = 0;
    for (let i = 0; i < minLen; i++) {
      if (originalLines[i] !== currentLines[i]) {
        added++;
        removed++;
      }
    }
    if (currentLines.length > originalLines.length) {
      added += currentLines.length - originalLines.length;
    } else if (originalLines.length > currentLines.length) {
      removed += originalLines.length - currentLines.length;
    }
    return { added, removed, total: added + removed };
  }, [code, originalCode, codeModified]);

  useEffect(() => {
    setCodeModified(code !== originalCode);
    if (code !== originalCode) {
      setCodeChangeIndicator(true);
      const timer = setTimeout(() => setCodeChangeIndicator(false), 300);
      return () => clearTimeout(timer);
    }
  }, [code, originalCode]);

  // 顶部状态栏始终与「最近一次执行记录」对齐，运行/提交共用同一数据源
  const latestRecord = useMemo(() => executionHistory[0] ?? null, [executionHistory]);

  const activeResult = useMemo(
    () => executionHistory.find(h => h.id === activeHistoryId) ?? null,
    [executionHistory, activeHistoryId],
  );

  const submissionStatus = useMemo(() => {
    if (!latestRecord) return null;
    const isPending = latestRecord.status === 'running' || latestRecord.status === 'pending';
    const isSuccess = latestRecord.status === 'success';
    const isFailed = latestRecord.status === 'failed';
    return {
      isPending,
      isSuccess,
      isFailed,
      status: latestRecord.status,
      passedCount: latestRecord.passedCount,
      totalCount: latestRecord.totalCount,
      runtime: latestRecord.runtime,
      memory: latestRecord.memory,
      timestamp: latestRecord.timestamp,
      type: latestRecord.type,
    };
  }, [latestRecord]);

  useEffect(() => {
    if (statusMessage) {
      const timer = setTimeout(() => setStatusMessage(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [statusMessage]);

  const showStatus = useCallback((type: 'success' | 'error' | 'info', text: string) => {
    setStatusMessage({ type, text });
  }, []);

  const handleLanguageSelect = useCallback((newLang: string) => {
    setShowLanguageDropdown(false);
    if (newLang === language) return;
    if (isRunning || isSubmitting) {
      showStatus('error', '代码正在执行，请等待完成后再切换语言');
      return;
    }

    if (codeModified && code.trim() !== '') {
      setPendingLanguage(newLang);
      setLanguageConfirmOpen(true);
    } else {
      setLanguage(newLang);
      showStatus('info', `已切换到 ${LANGUAGE_CONFIGS.find(l => l.value === newLang)?.label || newLang}`);
    }
  }, [language, codeModified, code, setLanguage, showStatus, isRunning, isSubmitting]);

  const confirmLanguageChange = useCallback(() => {
    if (pendingLanguage) {
      setLanguage(pendingLanguage);
      showStatus('info', `已切换到 ${LANGUAGE_CONFIGS.find(l => l.value === pendingLanguage)?.label || pendingLanguage}`);
    }
    setLanguageConfirmOpen(false);
    setPendingLanguage(null);
  }, [pendingLanguage, setLanguage, showStatus]);

  const getTimeAgo = (dateString: string) => {
    const diff = Date.now() - new Date(dateString).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return '刚刚';
    if (mins < 60) return `${mins} 分钟前`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} 小时前`;
    return `${Math.floor(hours / 24)} 天前`;
  };

  const cancelLanguageChange = useCallback(() => {
    setLanguageConfirmOpen(false);
    setPendingLanguage(null);
  }, []);

  const handleRun = useCallback(async () => {
    if (disabled || isRunning || isSubmitting) return;

    const historyId = `run-${Date.now()}`;
    const pendingResult: ExecutionResult = { success: false, output: '代码运行中...' };

    setIsRunning(true);
    showStatus('info', '正在运行代码...');

    addExecutionHistory({
      id: historyId,
      type: 'run',
      result: pendingResult,
      timestamp: new Date().toISOString(),
      language,
      passedCount: 0,
      totalCount: 0,
      status: 'running',
    });

    try {
      let result;
      if (onRun) {
        result = await onRun();
      } else {
        await new Promise(resolve => setTimeout(resolve, 1000));
        result = { success: true, output: '// 模拟运行结果\nHello, World!' };
      }

      const passedCount = result.testResults?.filter(t => t.passed).length || 0;
      const totalCount = result.testResults?.length || 0;
      // 统一判定：执行成功即完成；全部用例通过（或无测试用例）为成功，否则失败
      const isSuccess = result.success && (totalCount === 0 || passedCount === totalCount);

      updateExecutionHistory(historyId, {
        result,
        passedCount,
        totalCount,
        runtime: result.runtime,
        memory: result.memory,
        status: isSuccess ? 'success' : 'failed',
      });

      if (isSuccess) {
        showStatus('success', '运行成功 ✓');
      } else {
        showStatus('error', result.error || '运行失败 ✗');
      }
    } catch (error) {
      const errorResult = { success: false, error: error instanceof Error ? error.message : '运行出错' };
      updateExecutionHistory(historyId, {
        result: errorResult,
        status: 'failed',
      });
      showStatus('error', errorResult.error);
    } finally {
      setIsRunning(false);
    }
  }, [disabled, isRunning, isSubmitting, onRun, setIsRunning, addExecutionHistory, updateExecutionHistory, language, showStatus]);

  const handleSubmit = useCallback(async () => {
    if (disabled || isRunning || isSubmitting) return;

    if (!window.confirm('确定要提交代码吗？提交后将无法修改。')) {
      return;
    }

    const historyId = `submit-${Date.now()}`;
    const pendingResult: ExecutionResult = { success: false, output: '代码提交中...' };

    setIsSubmitting(true);
    showStatus('info', '正在提交代码...');

    addExecutionHistory({
      id: historyId,
      type: 'submit',
      result: pendingResult,
      timestamp: new Date().toISOString(),
      language,
      passedCount: 0,
      totalCount: 0,
      status: 'running',
    });

    try {
      let result;
      if (onSubmit) {
        result = await onSubmit();
      } else {
        await new Promise(resolve => setTimeout(resolve, 1500));
        const testCases = currentProblem?.testCases?.filter(t => !t.hidden) || [];
        result = {
          success: Math.random() > 0.3,
          output: `// 模拟提交结果\n通过 ${Math.floor(Math.random() * testCases.length) + 1}/${testCases.length} 个测试用例`,
          runtime: Math.floor(Math.random() * 80) + 20,
          memory: Math.floor(Math.random() * 60) + 30,
          testResults: testCases.map(t => ({
            passed: Math.random() > 0.3,
            input: t.input,
            expected: t.expectedOutput,
            actual: Math.random() > 0.3 ? t.expectedOutput : 'wrong_output',
          })),
        };
      }

      const passedCount = result.testResults?.filter(t => t.passed).length || 0;
      const totalCount = result.testResults?.length || 0;
      // 提交要求全部用例通过（无测试结果视为失败），完成后明确落为 success/failed
      const isSuccess = result.success && passedCount === totalCount && totalCount > 0;

      updateExecutionHistory(historyId, {
        result,
        passedCount,
        totalCount,
        runtime: result.runtime,
        memory: result.memory,
        status: isSuccess ? 'success' : 'failed',
      });

      if (isSuccess) {
        showStatus('success', '提交成功 ✓ 所有测试用例通过');
      } else {
        showStatus('error', '提交失败 ✗ 存在未通过的测试用例');
      }
    } catch (error) {
      const errorResult = { success: false, error: error instanceof Error ? error.message : '提交出错' };
      updateExecutionHistory(historyId, {
        result: errorResult,
        status: 'failed',
      });
      showStatus('error', errorResult.error);
    } finally {
      setIsSubmitting(false);
    }
  }, [disabled, isRunning, isSubmitting, onSubmit, currentProblem, setIsSubmitting, addExecutionHistory, updateExecutionHistory, language, showStatus]);

  const buttonBaseStyle: React.CSSProperties = {
    padding: '6px 18px',
    borderRadius: '6px',
    border: 'none',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 500,
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    transition: 'all 0.2s ease',
    minWidth: '90px',
    justifyContent: 'center',
  };

  const getRunButtonStyle = (): React.CSSProperties => {
    const base = { ...buttonBaseStyle };
    if (disabled || isRunning || isSubmitting) {
      return { ...base, background: '#555', color: '#888', cursor: 'not-allowed', opacity: 0.7 };
    }
    return { ...base, background: '#4caf50', color: '#fff' };
  };

  const getSubmitButtonStyle = (): React.CSSProperties => {
    const base = { ...buttonBaseStyle };
    if (disabled || isRunning || isSubmitting) {
      return { ...base, background: '#555', color: '#888', cursor: 'not-allowed', opacity: 0.7 };
    }
    return { ...base, background: '#2196f3', color: '#fff' };
  };

  const Spinner = () => (
    <div style={{
      width: '14px',
      height: '14px',
      border: '2px solid transparent',
      borderTop: '2px solid currentColor',
      borderRadius: '50%',
      animation: 'spin 0.8s linear infinite',
    }} />
  );

  const LanguageBadge: React.FC<{ config: LanguageConfig; onClick: () => void; isOpen: boolean }> = ({ config, onClick, isOpen }) => (
    <div
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '6px 12px 6px 8px',
        borderRadius: '8px',
        background: config.bgColor,
        border: `2px solid ${config.borderColor}`,
        cursor: disabled || isRunning || isSubmitting ? 'not-allowed' : 'pointer',
        opacity: disabled || isRunning || isSubmitting ? 0.5 : 1,
        transition: 'all 0.2s ease',
        position: 'relative',
      }}
      onMouseEnter={(e) => {
        if (!disabled && !isRunning && !isSubmitting) {
          e.currentTarget.style.transform = 'translateY(-1px)';
          e.currentTarget.style.boxShadow = `0 2px 8px ${config.color}40`;
        }
      }}
      onMouseLeave={(e) => {
        if (!disabled && !isRunning && !isSubmitting) {
          e.currentTarget.style.transform = 'translateY(0)';
          e.currentTarget.style.boxShadow = 'none';
        }
      }}
    >
      <div style={{
        width: '26px',
        height: '26px',
        borderRadius: '6px',
        background: config.color,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#1e1e1e',
        fontSize: '11px',
        fontWeight: 800,
        fontFamily: 'monospace',
      }}>
        {config.icon}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <span style={{ color: '#fff', fontSize: '13px', fontWeight: 600 }}>{config.label}</span>
        <span style={{ color: config.color, fontSize: '10px', fontWeight: 500 }}>{config.value.toUpperCase()}</span>
      </div>
      <span style={{
        color: config.color,
        fontSize: '10px',
        marginLeft: '4px',
        transition: 'transform 0.2s',
        transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
      }}>▼</span>
      {codeModified && (
        <div style={{
          position: 'absolute',
          top: '-4px',
          right: '-4px',
          width: '10px',
          height: '10px',
          background: '#ff9800',
          borderRadius: '50%',
          animation: 'pulse 1.5s ease-in-out infinite',
          boxShadow: '0 0 8px #ff9800',
        }} title="代码已修改" />
      )}
    </div>
  );

  const LanguageDropdown: React.FC = () => (
    <div style={{
      position: 'absolute',
      top: '100%',
      left: '0',
      marginTop: '6px',
      background: '#2d2d2d',
      border: '1px solid #444',
      borderRadius: '8px',
      boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5)',
      zIndex: 1000,
      overflow: 'hidden',
      minWidth: '180px',
    }}>
      {LANGUAGE_CONFIGS.map((lang) => (
        <div
          key={lang.value}
          onClick={() => handleLanguageSelect(lang.value)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '10px 14px',
            cursor: 'pointer',
            transition: 'background 0.15s',
            background: language === lang.value ? lang.bgColor : 'transparent',
          }}
          onMouseEnter={(e) => {
            if (language !== lang.value) {
              e.currentTarget.style.background = lang.bgColor;
            }
          }}
          onMouseLeave={(e) => {
            if (language !== lang.value) {
              e.currentTarget.style.background = 'transparent';
            }
          }}
        >
          <div style={{
            width: '22px',
            height: '22px',
            borderRadius: '4px',
            background: lang.color,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#1e1e1e',
            fontSize: '10px',
            fontWeight: 800,
            fontFamily: 'monospace',
          }}>
            {lang.icon}
          </div>
          <span style={{ color: '#fff', fontSize: '13px', fontWeight: 500, flex: 1 }}>{lang.label}</span>
          {language === lang.value && (
            <span style={{ color: lang.color, fontSize: '12px', fontWeight: 600 }}>✓</span>
          )}
        </div>
      ))}
    </div>
  );

  const CodeChangeIndicator: React.FC = () => (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      padding: '6px 12px',
      background: codeChangeIndicator ? 'rgba(255, 152, 0, 0.2)' : 'rgba(255, 152, 0, 0.1)',
      border: codeChangeIndicator ? '1px solid #ff9800' : '1px solid rgba(255, 152, 0, 0.3)',
      borderRadius: '6px',
      transition: 'all 0.3s ease',
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        animation: codeChangeIndicator ? 'flash 0.3s ease' : 'none',
      }}>
        <span style={{ color: '#ff9800', fontSize: '14px' }}>✏️</span>
        <span style={{ color: '#ff9800', fontSize: '11px', fontWeight: 600 }}>已修改</span>
      </div>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        fontSize: '10px',
        fontFamily: 'monospace',
      }}>
        {codeChangeStats.added > 0 && (
          <span style={{ color: '#4caf50', fontWeight: 600 }}>
            +{codeChangeStats.added}
          </span>
        )}
        {codeChangeStats.removed > 0 && (
          <span style={{ color: '#f44336', fontWeight: 600 }}>
            -{codeChangeStats.removed}
          </span>
        )}
        {codeChangeStats.total > 0 && (
          <span style={{ color: '#888' }}>
            · {codeChangeStats.total} 处变更
          </span>
        )}
      </div>
    </div>
  );

  const SubmissionStatusBar: React.FC = () => {
    if (!submissionStatus) {
      return (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '6px 12px',
          background: 'rgba(102, 102, 102, 0.1)',
          border: '1px solid rgba(102, 102, 102, 0.3)',
          borderRadius: '6px',
        }}>
          <span style={{ color: '#666', fontSize: '14px' }}>📊</span>
          <span style={{ color: '#666', fontSize: '11px', fontWeight: 500 }}>暂无执行记录</span>
        </div>
      );
    }

    const typeLabel = submissionStatus.type === 'submit' ? '提交' : '运行';
    const stateColor = submissionStatus.isPending
      ? '#2196f3'
      : submissionStatus.isSuccess
      ? '#4caf50'
      : '#f44336';
    const stateBg = submissionStatus.isPending
      ? 'rgba(33, 150, 243, 0.1)'
      : submissionStatus.isSuccess
      ? 'rgba(76, 175, 80, 0.1)'
      : 'rgba(244, 67, 54, 0.1)';
    const stateBorder = submissionStatus.isPending
      ? 'rgba(33, 150, 243, 0.3)'
      : submissionStatus.isSuccess
      ? 'rgba(76, 175, 80, 0.3)'
      : 'rgba(244, 67, 54, 0.3)';
    const stateLabel = submissionStatus.isPending
      ? '进行中'
      : submissionStatus.isSuccess
      ? '通过'
      : '失败';
    const stateIcon = submissionStatus.isPending ? '⏳' : submissionStatus.isSuccess ? '✅' : '❌';

    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '6px 12px',
        background: stateBg,
        border: `1px solid ${stateBorder}`,
        borderRadius: '6px',
        transition: 'all 0.3s ease',
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
        }}>
          <span style={{ fontSize: '14px' }}>{stateIcon}</span>
          <span style={{
            color: stateColor,
            fontSize: '11px',
            fontWeight: 600,
          }}>
            {typeLabel}{stateLabel}
          </span>
        </div>

        <div style={{ width: '1px', height: '14px', background: '#444' }} />

        {submissionStatus.totalCount > 0 && (
          <>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '10px',
              fontFamily: 'monospace',
            }}>
              <span style={{
                color: stateColor,
                fontWeight: 700,
                fontSize: '11px',
              }}>
                {submissionStatus.isPending
                  ? '---'
                  : `${submissionStatus.passedCount}/${submissionStatus.totalCount}`}
              </span>
              <span style={{ color: '#666' }}>用例</span>
            </div>

            <div style={{ width: '1px', height: '14px', background: '#444' }} />
          </>
        )}

        {!submissionStatus.isPending &&
          (submissionStatus.runtime !== undefined || submissionStatus.memory !== undefined) && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '10px',
            fontFamily: 'monospace',
          }}>
            {submissionStatus.runtime !== undefined && (
              <span style={{ color: '#2196f3', fontWeight: 600 }}>
                {submissionStatus.runtime}ms
              </span>
            )}
            {submissionStatus.runtime !== undefined && submissionStatus.memory !== undefined && (
              <span style={{ width: '4px', height: '4px', background: '#444', borderRadius: '50%' }} />
            )}
            {submissionStatus.memory !== undefined && (
              <span style={{ color: '#9c27b0', fontWeight: 600 }}>
                {submissionStatus.memory}MB
              </span>
            )}
          </div>
        )}

        <div style={{ width: '1px', height: '14px', background: '#444' }} />

        <span style={{
          color: langConfig.color,
          fontSize: '10px',
          fontWeight: 600,
          fontFamily: 'monospace',
        }}>
          {latestRecord?.language.toUpperCase()}
        </span>

        <div style={{ width: '1px', height: '14px', background: '#444' }} />

        <span style={{ color: '#666', fontSize: '10px' }}>
          {getTimeAgo(submissionStatus.timestamp)}
        </span>
      </div>
    );
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px',
        padding: '10px 16px',
        background: '#1e1e1e',
        borderBottom: '1px solid #333',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ position: 'relative' }}>
            <LanguageBadge
              config={langConfig}
              onClick={() => !disabled && !isRunning && !isSubmitting && setShowLanguageDropdown(!showLanguageDropdown)}
              isOpen={showLanguageDropdown}
            />
            {showLanguageDropdown && (
              <>
                <div
                  style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    zIndex: 999,
                  }}
                  onClick={() => setShowLanguageDropdown(false)}
                />
                <LanguageDropdown />
              </>
            )}
          </div>

          {codeModified && <CodeChangeIndicator />}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <SubmissionStatusBar />

          {statusMessage && (
            <span style={{
              color: statusMessage.type === 'success' ? '#4caf50' : statusMessage.type === 'error' ? '#f44336' : '#2196f3',
              fontSize: '12px',
              fontWeight: 500,
              padding: '4px 10px',
              borderRadius: '4px',
              background: statusMessage.type === 'success' ? 'rgba(76, 175, 80, 0.1)' :
                statusMessage.type === 'error' ? 'rgba(244, 67, 54, 0.1)' : 'rgba(33, 150, 243, 0.1)',
            }}>
              {statusMessage.text}
            </span>
          )}

          {showRunButton && (
            <button
              onClick={handleRun}
              disabled={disabled || isRunning || isSubmitting}
              style={getRunButtonStyle()}
              onMouseEnter={(e) => {
                if (!disabled && !isRunning && !isSubmitting) {
                  e.currentTarget.style.background = '#45a049';
                  e.currentTarget.style.transform = 'translateY(-1px)';
                  e.currentTarget.style.boxShadow = '0 2px 8px rgba(76, 175, 80, 0.3)';
                }
              }}
              onMouseLeave={(e) => {
                if (!disabled && !isRunning && !isSubmitting) {
                  e.currentTarget.style.background = '#4caf50';
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = 'none';
                }
              }}
              onMouseDown={(e) => {
                if (!disabled && !isRunning && !isSubmitting) {
                  e.currentTarget.style.transform = 'translateY(0)';
                }
              }}
              title={disabled ? '面试未开始' : isRunning ? '正在运行...' : '运行代码 (Ctrl+Enter)'}
            >
              {isRunning ? <Spinner /> : '▶'}
              {isRunning ? '运行中' : '运行'}
            </button>
          )}

          {showSubmitButton && (
            <button
              onClick={handleSubmit}
              disabled={disabled || isRunning || isSubmitting}
              style={getSubmitButtonStyle()}
              onMouseEnter={(e) => {
                if (!disabled && !isRunning && !isSubmitting) {
                  e.currentTarget.style.background = '#1976d2';
                  e.currentTarget.style.transform = 'translateY(-1px)';
                  e.currentTarget.style.boxShadow = '0 2px 8px rgba(33, 150, 243, 0.3)';
                }
              }}
              onMouseLeave={(e) => {
                if (!disabled && !isRunning && !isSubmitting) {
                  e.currentTarget.style.background = '#2196f3';
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = 'none';
                }
              }}
              onMouseDown={(e) => {
                if (!disabled && !isRunning && !isSubmitting) {
                  e.currentTarget.style.transform = 'translateY(0)';
                }
              }}
              title={disabled ? '面试未开始' : isSubmitting ? '正在提交...' : '提交代码 (Ctrl+Shift+Enter)'}
            >
              {isSubmitting ? <Spinner /> : '✓'}
              {isSubmitting ? '提交中' : '提交'}
            </button>
          )}
        </div>
      </div>

      {languageConfirmOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.6)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }}>
          <div style={{
            background: '#2d2d2d',
            borderRadius: '8px',
            padding: '24px',
            maxWidth: '400px',
            width: '90%',
            border: '1px solid #444',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5)',
          }}>
            <h3 style={{ margin: '0 0 12px 0', color: '#fff', fontSize: '16px' }}>
              ⚠️ 确认切换语言
            </h3>
            <p style={{ margin: '0 0 20px 0', color: '#ccc', fontSize: '13px', lineHeight: 1.6 }}>
              当前代码已修改，切换到 <strong style={{ color: getLanguageConfig(pendingLanguage || '').color }}>
                {LANGUAGE_CONFIGS.find(l => l.value === pendingLanguage)?.label || pendingLanguage}
              </strong> 将重置代码模板。
              <br /><br />
              是否继续？
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                onClick={cancelLanguageChange}
                style={{
                  padding: '8px 16px',
                  borderRadius: '6px',
                  border: '1px solid #555',
                  background: 'transparent',
                  color: '#ccc',
                  cursor: 'pointer',
                  fontSize: '13px',
                }}
              >
                取消
              </button>
              <button
                onClick={confirmLanguageChange}
                style={{
                  padding: '8px 16px',
                  borderRadius: '6px',
                  border: 'none',
                  background: '#ff9800',
                  color: '#fff',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: 500,
                }}
              >
                确认切换
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ flex: activeResult ? '0 0 60%' : '1', overflow: 'hidden', minHeight: '200px' }}>
          <Editor
            height="100%"
            language={language}
            value={code}
            onChange={(v) => setCode(v || '')}
            theme="vs-dark"
            options={{
              fontSize: 14,
              minimap: { enabled: false },
              wordWrap: 'on',
              readOnly: disabled,
              automaticLayout: true,
            }}
          />
        </div>

        {activeResult && (
          <div style={{ flex: '0 0 40%', minHeight: '200px', display: 'flex', flexDirection: 'column' }}>
            <SubmissionResult
              title={activeResult.type === 'submit' ? '提交结果' : '运行结果'}
              type={activeResult.type}
              status={activeResult.status}
              success={activeResult.result.success}
              output={activeResult.result.output}
              error={activeResult.result.error}
              runtime={activeResult.result.runtime}
              memory={activeResult.result.memory}
              testResults={activeResult.result.testResults}
            />
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.7; transform: scale(1.2); }
        }
        @keyframes flash {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
};
