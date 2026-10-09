import React, { useEffect, useRef } from 'react';

export interface LeaderboardEntry {
  id: string;
  playerName: string;
  score: number;
}

interface LeaderboardModalProps {
  show: boolean;
  leaderboard: LeaderboardEntry[];
  isLoading?: boolean;
  error?: string | null;
  highlightedId?: string | null;
  onRetry?: () => void;
  onClose: () => void;
}

export const LeaderboardModal: React.FC<LeaderboardModalProps> = ({
  show,
  leaderboard,
  isLoading = false,
  error = null,
  highlightedId = null,
  onRetry,
  onClose,
}) => {
  const highlightedRowRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (show && highlightedId && !isLoading && highlightedRowRef.current) {
      const timer = setTimeout(() => {
        highlightedRowRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });
      }, 120);
      return () => clearTimeout(timer);
    }
  }, [show, highlightedId, isLoading, leaderboard]);

  if (!show) return null;

  const playerRankIndex = highlightedId
    ? leaderboard.findIndex((entry) => entry.id === highlightedId)
    : -1;

  return (
    <div
      id="leaderboard-modal"
      style={{ zIndex: 300 }}
      className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{ zIndex: 301 }}
        className="panel relative w-full max-w-sm border-2 border-blue-500 bg-slate-950/95 p-5 shadow-[0_0_30px_rgba(59,130,246,0.6)]"
      >
        <div className="flex items-center justify-between border-b-2 border-blue-900/80 pb-3 mb-3">
          <h2 className="text-xl sm:text-2xl font-bold text-yellow-400 font-[Orbitron] tracking-wider">
            PILOT RANKS
          </h2>
          <button
            onClick={onClose}
            aria-label="Close Leaderboard"
            className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 border border-slate-600 text-gray-300 hover:text-white flex items-center justify-center font-bold text-sm transition-colors cursor-pointer"
          >
            ✕
          </button>
        </div>

        {playerRankIndex !== -1 && (
          <div className="mb-3 px-3 py-2 rounded-lg bg-blue-950/80 border border-sky-400/60 flex items-center justify-between text-xs font-[Orbitron] text-sky-200 shadow-[0_0_12px_rgba(56,189,248,0.3)]">
            <span>YOUR RANK: #{playerRankIndex + 1}</span>
            <span className="text-yellow-300 font-bold">
              {leaderboard[playerRankIndex].score.toLocaleString()} PTS
            </span>
          </div>
        )}

        <div className="h-64 overflow-y-auto overscroll-contain touch-pan-y [-webkit-overflow-scrolling:touch] pr-1 mb-4 space-y-1.5 modern-scrollbar">
          {isLoading ? (
            <div className="h-full flex flex-col items-center justify-center text-sky-300 font-[Orbitron] text-sm gap-2">
              <div className="w-7 h-7 border-2 border-sky-400 border-t-transparent rounded-full animate-spin" />
              <span className="tracking-widest text-xs">LOADING RANKS...</span>
            </div>
          ) : error ? (
            <div className="h-full flex flex-col items-center justify-center text-center px-3 gap-3">
              <p className="text-red-400 font-[Orbitron] text-xs tracking-wider">
                FAILED TO LOAD LEADERBOARD
              </p>
              {onRetry && (
                <button
                  onClick={onRetry}
                  className="btn !py-2 !px-4 !text-xs !w-auto !my-0"
                >
                  OOPS! RETRY
                </button>
              )}
            </div>
          ) : leaderboard.length === 0 ? (
            <div className="h-full flex items-center justify-center">
              <p className="text-gray-400 text-center py-4 italic font-mono text-sm">
                No scores yet—be the first!
              </p>
            </div>
          ) : (
            leaderboard.map((entry, index) => {
              const isHighlighted = entry.id === highlightedId;
              const rankBadge =
                index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;

              return (
                <div
                  key={entry.id}
                  ref={isHighlighted ? highlightedRowRef : null}
                  className={`flex items-center justify-between px-3 py-2.5 rounded-lg border font-mono text-sm transition-all ${
                    isHighlighted
                      ? 'bg-blue-900/60 border-sky-400 text-white shadow-[0_0_14px_rgba(56,189,248,0.45)]'
                      : index < 3
                      ? 'bg-slate-900/90 border-blue-900/60 text-blue-100'
                      : 'bg-slate-900/40 border-gray-800/80 text-blue-100'
                  }`}
                >
                  <div className="flex items-center gap-2 truncate pr-2">
                    <span className="font-bold min-w-[1.75rem] text-left text-yellow-400 font-[Orbitron] text-xs">
                      {rankBadge}
                    </span>
                    <span className="font-bold truncate">{entry.playerName}</span>
                    {isHighlighted && (
                      <span className="ml-1 px-1.5 py-0.5 text-[10px] font-[Orbitron] font-bold bg-sky-500 text-slate-950 rounded uppercase tracking-wider shrink-0">
                        YOU
                      </span>
                    )}
                  </div>
                  <span className="text-yellow-300 font-[Orbitron] font-bold shrink-0">
                    {Number(entry.score || 0).toLocaleString()}
                  </span>
                </div>
              );
            })
          )}
        </div>

        <button
          className="btn btn-outline w-full !my-0 border-2 border-blue-600 hover:bg-blue-900/60 text-white"
          onClick={onClose}
        >
          BACK
        </button>
      </div>
    </div>
  );
};

