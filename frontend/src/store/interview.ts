import { create } from 'zustand';
import { Problem, Submission, InterviewRoom, User, CandidateInvitation, ParticipantStatus, getDefaultCodeByLanguage } from '../types';

export interface ExecutionResult {
  success: boolean;
  output?: string;
  error?: string;
  runtime?: number;
  memory?: number;
  testResults?: { passed: boolean; input: string; expected: string; actual?: string }[];
}

export interface ExecutionHistoryItem {
  id: string;
  type: 'run' | 'submit';
  result: ExecutionResult;
  timestamp: string;
  language: string;
  code?: string;
  passedCount: number;
  totalCount: number;
  runtime?: number;
  memory?: number;
  status: 'pending' | 'running' | 'success' | 'failed';
}

const MAX_HISTORY_SIZE = 50;

export interface StatusChangeNotification {
  id: string;
  oldStatus: InterviewRoom['status'];
  newStatus: InterviewRoom['status'];
  timestamp: string;
}

interface InterviewState {
  problems: Problem[];
  currentProblem: Problem | null;
  submissions: Submission[];
  deprecatedRoom: InterviewRoom | null;
  room: InterviewRoom | null;
  code: string;
  originalCode: string;
  language: string;
  isRunning: boolean;
  isSubmitting: boolean;
  executionHistory: ExecutionHistoryItem[];
  currentExecutionId: string | null;
  selectedHistoryId: string | null;
  currentUser: User | null;
  myRooms: InterviewRoom[];
  currentRoom: InterviewRoom | null;
  invitations: CandidateInvitation[];
  participants: ParticipantStatus[];
  isConnected: boolean;
  statusChangeNotification: StatusChangeNotification | null;
  setProblem: (p: Problem) => void;
  setCode: (code: string) => void;
  setLanguage: (lang: string) => void;
  setIsRunning: (running: boolean) => void;
  setIsSubmitting: (submitting: boolean) => void;
  addExecutionHistory: (item: ExecutionHistoryItem) => void;
  updateExecutionHistory: (id: string, updates: Partial<ExecutionHistoryItem>) => void;
  setCurrentExecutionId: (id: string | null) => void;
  setSelectedHistoryId: (id: string | null) => void;
  clearExecutionHistory: () => void;
  resetOriginalCode: () => void;
  addSubmission: (s: Submission) => void;
  setRoom: (room: InterviewRoom) => void;
  setCurrentUser: (user: User) => void;
  setMyRooms: (rooms: InterviewRoom[]) => void;
  setCurrentRoom: (room: InterviewRoom | null) => void;
  setInvitations: (invitations: CandidateInvitation[]) => void;
  setParticipants: (participants: ParticipantStatus[]) => void;
  addInvitation: (invitation: CandidateInvitation) => void;
  updateInvitationStatus: (invitationId: string, status: string) => void;
  updateParticipant: (participant: ParticipantStatus) => void;
  setIsConnected: (connected: boolean) => void;
  setStatusChangeNotification: (notification: StatusChangeNotification | null) => void;
  resetRoom: () => void;
  setProblems: (problems: Problem[]) => void;
  addProblem: (problem: Problem) => void;
  updateProblem: (problem: Problem) => void;
  removeProblem: (problemId: string) => void;
}

export const useInterviewStore = create<InterviewState>((set) => ({
  problems: [], currentProblem: null, submissions: [], deprecatedRoom: null, room: null,
  code: getDefaultCodeByLanguage('javascript'), originalCode: getDefaultCodeByLanguage('javascript'), language: 'javascript',
  isRunning: false, isSubmitting: false,
  executionHistory: [], currentExecutionId: null, selectedHistoryId: null,
  currentUser: null, myRooms: [], currentRoom: null, invitations: [], participants: [], isConnected: false,
  statusChangeNotification: null,
  setProblem: (p) => set({ currentProblem: p }),
  setCode: (code) => set({ code }),
  setLanguage: (lang) => {
    const defaultCode = getDefaultCodeByLanguage(lang);
    // 切换语言会重置代码模板，旧记录的代码已不再对应编辑器内容，
    // 因此只清空“当前结果”指针；历史记录保留以便追溯，可在历史对比页查看。
    set({
      language: lang,
      code: defaultCode,
      originalCode: defaultCode,
      currentExecutionId: null,
    });
  },
  setIsRunning: (running) => set({ isRunning: running }),
  setIsSubmitting: (submitting) => set({ isSubmitting: submitting }),
  addExecutionHistory: (item) => set((state) => ({
    executionHistory: [item, ...state.executionHistory].slice(0, MAX_HISTORY_SIZE),
    currentExecutionId: item.id,
    selectedHistoryId: item.id,
  })),
  setCurrentExecutionId: (id) => set({ currentExecutionId: id }),
  setSelectedHistoryId: (id) => set({ selectedHistoryId: id }),
  clearExecutionHistory: () => set({ executionHistory: [], currentExecutionId: null, selectedHistoryId: null }),
  resetOriginalCode: () => set({ originalCode: useInterviewStore.getState().code }),
  addSubmission: (s) => set({ submissions: [s, ...useInterviewStore.getState().submissions] }),
  setRoom: (room) => set({ deprecatedRoom: room, room, currentRoom: room }),
  setCurrentUser: (user) => set({ currentUser: user }),
  setMyRooms: (rooms) => set({ myRooms: rooms }),
  setCurrentRoom: (room) => set((state) => {
    const oldRoom = state.currentRoom;
    if (oldRoom && room && oldRoom.status !== room.status) {
      const notification: StatusChangeNotification = {
        id: `status-change-${Date.now()}`,
        oldStatus: oldRoom.status,
        newStatus: room.status,
        timestamp: new Date().toISOString(),
      };
      return {
        currentRoom: room,
        deprecatedRoom: room,
        room,
        statusChangeNotification: notification,
      };
    }
    return { currentRoom: room, deprecatedRoom: room, room };
  }),
  setInvitations: (invitations) => set({ invitations }),
  setParticipants: (participants) => set({ participants }),
  addInvitation: (invitation) => set((state) => ({ invitations: [...state.invitations, invitation] })),
  updateInvitationStatus: (invitationId, status) => set((state) => ({
    invitations: state.invitations.map((inv) =>
      inv.id === invitationId ? { ...inv, status: status as CandidateInvitation['status'] } : inv
    ),
  })),
  updateParticipant: (participant) => set((state) => {
    const exists = state.participants.some((p) => p.userId === participant.userId);
    if (exists) {
      return {
        participants: state.participants.map((p) =>
          p.userId === participant.userId ? participant : p
        ),
      };
    }
    return { participants: [...state.participants, participant] };
  }),
  setIsConnected: (connected) => set({ isConnected: connected }),
  setStatusChangeNotification: (notification) => set({ statusChangeNotification: notification }),
  resetRoom: () => set({
    currentRoom: null, deprecatedRoom: null, room: null,
    currentProblem: null,
    invitations: [], participants: [], isConnected: false,
    executionHistory: [],
    currentExecutionId: null,
    selectedHistoryId: null,
    isRunning: false,
    isSubmitting: false,
    statusChangeNotification: null,
  }),
  setProblems: (problems) => set({ problems }),
  addProblem: (problem) => set((state) => ({ problems: [problem, ...state.problems] })),
  updateProblem: (problem) => set((state) => ({
    problems: state.problems.map((p) => p.id === problem.id ? problem : p),
  })),
  removeProblem: (problemId) => set((state) => ({
    problems: state.problems.filter((p) => p.id !== problemId),
  })),
  updateExecutionHistory: (id, updates) => set((state) => ({
    executionHistory: state.executionHistory.map((item) =>
      item.id === id ? { ...item, ...updates } : item
    ),
  })),
}));
