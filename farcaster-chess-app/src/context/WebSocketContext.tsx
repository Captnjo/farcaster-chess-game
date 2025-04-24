'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { toast } from 'react-hot-toast';
import { ChessValidationService } from '../services/chessValidation';

interface WebSocketContextType {
  ws: WebSocket | null;
  isConnected: boolean;
  createGame: (params: GameCreationParams) => void;
  joinGame: (gameId: string) => void;
  makeMove: (from: string, to: string, promotion?: string) => void;
  resignGame: () => void;
  resetGame: () => void;
  currentGame: {
    id: string | null;
    color: 'white' | 'black' | null;
    status: 'waiting' | 'active' | 'finished' | null;
    fen: string | null;
  };
}

interface GameCreationParams {
  mode: 'classic' | 'blitz' | 'rapid';
  opponentType: 'ai' | 'random' | 'specific';
  timeControls?: {
    minutes: number;
    increment: number;
  } | null;
  specificUsername?: string;
  preferredColor?: 'white' | 'black';
}

const WebSocketContext = createContext<WebSocketContextType | null>(null);

export const useWebSocket = () => {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error('useWebSocket must be used within a WebSocketProvider');
  }
  return context;
};

export const WebSocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [currentGame, setCurrentGame] = useState<WebSocketContextType['currentGame']>({
    id: null,
    color: null,
    status: null,
    fen: null
  });
  const [validationService, setValidationService] = useState<ChessValidationService | null>(null);

  // Initialize validation service when FEN changes
  useEffect(() => {
    if (currentGame.fen) {
      setValidationService(new ChessValidationService(currentGame.fen));
    }
  }, [currentGame.fen]);

  const connect = useCallback(() => {
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8000';
    const socket = new WebSocket(wsUrl);

    socket.onopen = () => {
      console.log('WebSocket connected');
      setIsConnected(true);
    };

    socket.onclose = () => {
      console.log('WebSocket disconnected');
      setIsConnected(false);
      setCurrentGame({
        id: null,
        color: null,
        status: null,
        fen: null
      });
      // Attempt to reconnect after 5 seconds
      setTimeout(connect, 5000);
    };

    socket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      handleMessage(data);
    };

    setWs(socket);
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (ws) {
        ws.close();
      }
    };
  }, []);

  const handleMessage = (data: any) => {
    switch (data.type) {
      case 'game_created':
        setCurrentGame({
          id: data.gameId,
          color: null,
          status: 'waiting',
          fen: data.fen
        });
        break;
      case 'game_started':
        console.log('[WebSocketContext] Received game_started:', data);
        const receivedFen = data.game?.fen;
        setCurrentGame({
          id: data.gameId,
          color: data.color,
          status: 'active',
          fen: receivedFen
        });
        if (receivedFen) {
          setValidationService(new ChessValidationService(receivedFen));
        }
        break;
      case 'move_made':
        setCurrentGame(prev => ({
          ...prev,
          fen: data.fen
        }));
        if (validationService && data.fen) {
          validationService.updateBoardState(data.fen);
        }
        break;
      case 'game_reset':
        setCurrentGame(prev => ({
          ...prev,
          fen: data.fen
        }));
        break;
      case 'error':
        toast.error(data.message);
        break;
      case 'game_over':
        setCurrentGame(prev => ({
          ...prev,
          status: 'finished'
        }));
        break;
      default:
        console.log('Unhandled message type:', data.type);
    }
  };

  const createGame = async (params: GameCreationParams) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      toast.error('Not connected to server');
      return;
    }

    console.log('Sending create game request:', params);

    const message = {
      type: 'create_game',
      mode: params.mode,
      opponentType: params.opponentType,
      timeControls: params.timeControls,
      specificUsername: params.specificUsername,
      preferredColor: params.preferredColor
    };

    try {
      ws.send(JSON.stringify(message));
    } catch (error) {
      console.error('Error sending create game request:', error);
      toast.error('Failed to create game');
    }
  };

  const joinGame = useCallback((gameId: string) => {
    if (ws && isConnected) {
      ws.send(JSON.stringify({
        type: 'join_game',
        gameId
      }));
    }
  }, [ws, isConnected]);

  const makeMove = useCallback((from: string, to: string, promotion?: string) => {
    if (ws && isConnected && currentGame.id && validationService) {
      // Validate move before sending to server
      const validation = validationService.validateMove(from, to, promotion);
      
      if (!validation.isValid) {
        toast.error(validation.message || 'Invalid move');
        return;
      }

      ws.send(JSON.stringify({
        type: 'make_move',
        gameId: currentGame.id,
        from,
        to,
        promotion
      }));
    }
  }, [ws, isConnected, currentGame.id, validationService]);

  const resignGame = useCallback(() => {
    if (ws && isConnected && currentGame.id) {
      ws.send(JSON.stringify({
        type: 'resign',
        gameId: currentGame.id
      }));
    }
  }, [ws, isConnected, currentGame.id]);

  const resetGame = useCallback(() => {
    if (ws && isConnected && currentGame.id) {
      ws.send(JSON.stringify({
        type: 'reset_game',
        gameId: currentGame.id
      }));
    }
  }, [ws, isConnected, currentGame.id]);

  return (
    <WebSocketContext.Provider value={{
      ws,
      isConnected,
      createGame,
      joinGame,
      makeMove,
      resignGame,
      resetGame,
      currentGame
    }}>
      {children}
    </WebSocketContext.Provider>
  );
}; 