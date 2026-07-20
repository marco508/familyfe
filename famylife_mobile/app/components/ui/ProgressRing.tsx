// components/ui/ProgressRing.tsx
// Anneau de progression circulaire (dégradé) — remplace un « 68 % » textuel par
// un visuel qu'on lit d'un coup d'œil. `children` s'affiche au centre (chiffre,
// avatar, emoji...). S'appuie sur react-native-svg (déjà présent via lucide).
import React, { useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { gradients } from '../../theme/designTokens';

// Compteur module pour des id de dégradé uniques et valides (évite les ':' de
// React.useId qui cassent les références SVG url(#...) sur certaines plateformes).
let seq = 0;

interface Props {
  /** Progression 0–100. */
  percent: number;
  size?: number;
  strokeWidth?: number;
  /** Dégradé de l'arc (2 couleurs minimum). */
  colors?: readonly string[];
  trackColor?: string;
  children?: React.ReactNode;
}

export default function ProgressRing({
  percent,
  size = 92,
  strokeWidth = 10,
  colors = gradients.progressDone,
  trackColor = 'rgba(58,40,51,0.10)',
  children,
}: Props) {
  const idRef = useRef(`progressRing${(seq += 1)}`);
  const id = idRef.current;

  const clamped = Math.max(0, Math.min(100, Number.isFinite(percent) ? percent : 0));
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - clamped / 100);
  const from = colors[0];
  const to = colors[colors.length - 1];

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={from} />
            <Stop offset="1" stopColor={to} />
          </LinearGradient>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={trackColor} strokeWidth={strokeWidth} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={`url(#${id})`}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      {children}
    </View>
  );
}
