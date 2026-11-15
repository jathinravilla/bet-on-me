// Butterfingers — a nervous stick of butter who keeps almost dropping a coin.
// Drawn in SVG on a 200x200 grid; the body, coin and props are separate layers so each can move on its own.
import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Ellipse, G, Line, Path, Rect } from 'react-native-svg';

import { colors } from '@/lib/theme';

export type Mood = 'idle' | 'nervous' | 'celebrate' | 'fumble' | 'thinking';

const INK = colors.ink;
const BUTTER = colors.butter;
const LABELS: Record<Mood, string> = {
  idle: 'Butterfingers the butter mascot, holding a coin',
  nervous: 'Butterfingers, sweating nervously',
  celebrate: 'Butterfingers celebrating, tossing a coin in the air',
  fumble: 'Butterfingers slipped and dropped the coin',
  thinking: 'Butterfingers inspecting with a magnifying glass',
};

const ARMS: Record<Mood, [string, string]> = {
  idle: ['M54 106 Q40 112 38 124', 'M146 104 Q160 100 164 86'],
  nervous: ['M54 104 Q38 100 34 88', 'M146 104 Q160 100 164 86'],
  celebrate: ['M54 98 Q38 82 34 62', 'M146 98 Q162 82 166 62'],
  fumble: ['M54 102 Q36 96 26 104', 'M146 102 Q166 106 174 120'],
  thinking: ['M54 108 Q44 122 62 124', 'M146 106 Q158 102 162 92'],
};

function Face({ mood }: { mood: Mood }) {
  const wide = mood === 'fumble' || mood === 'nervous';
  return (
    <G>
      {/* brows */}
      {mood === 'nervous' || mood === 'fumble' ? (
        <>
          <Path d="M72 80 L90 74" stroke={INK} strokeWidth={4} strokeLinecap="round" />
          <Path d="M128 80 L110 74" stroke={INK} strokeWidth={4} strokeLinecap="round" />
        </>
      ) : mood === 'thinking' ? (
        <>
          <Path d="M73 78 L90 78" stroke={INK} strokeWidth={4} strokeLinecap="round" />
          <Path d="M110 72 L127 76" stroke={INK} strokeWidth={4} strokeLinecap="round" />
        </>
      ) : null}
      {/* eyes */}
      {mood === 'celebrate' ? (
        <>
          <Path d="M73 94 Q82 82 91 94" stroke={INK} strokeWidth={5} strokeLinecap="round" fill="none" />
          <Path d="M109 94 Q118 82 127 94" stroke={INK} strokeWidth={5} strokeLinecap="round" fill="none" />
        </>
      ) : (
        <>
          <Circle cx={82} cy={92} r={wide ? 9 : 7.5} fill={wide ? '#FFFFFF' : INK} stroke={INK} strokeWidth={wide ? 3 : 0} />
          <Circle cx={118} cy={92} r={wide ? 9 : 7.5} fill={wide ? '#FFFFFF' : INK} stroke={INK} strokeWidth={wide ? 3 : 0} />
          {wide ? (
            <>
              <Circle cx={mood === 'fumble' ? 85 : 82} cy={mood === 'fumble' ? 95 : 92} r={3.5} fill={INK} />
              <Circle cx={mood === 'fumble' ? 121 : 118} cy={mood === 'fumble' ? 95 : 92} r={3.5} fill={INK} />
            </>
          ) : (
            <>
              <Circle cx={84.5} cy={89.5} r={2.4} fill="#FFFFFF" />
              <Circle cx={120.5} cy={89.5} r={2.4} fill="#FFFFFF" />
            </>
          )}
        </>
      )}
      {/* cheeks */}
      <Circle cx={68} cy={104} r={6} fill="#FF9F6B" opacity={0.55} />
      <Circle cx={132} cy={104} r={6} fill="#FF9F6B" opacity={0.55} />
      {/* mouth */}
      {mood === 'celebrate' ? (
        <Path d="M85 103 Q100 124 115 103 Z" fill="#7A2412" stroke={INK} strokeWidth={3.5} strokeLinejoin="round" />
      ) : mood === 'fumble' ? (
        <Ellipse cx={100} cy={110} rx={6.5} ry={8.5} fill="#7A2412" stroke={INK} strokeWidth={3.5} />
      ) : mood === 'nervous' ? (
        <Path d="M87 109 Q93.5 103 100 109 Q106.5 115 113 109" stroke={INK} strokeWidth={4} strokeLinecap="round" fill="none" />
      ) : mood === 'thinking' ? (
        <Path d="M92 110 Q100 107 107 111" stroke={INK} strokeWidth={4} strokeLinecap="round" fill="none" />
      ) : (
        <Path d="M90 107 Q100 115 110 107" stroke={INK} strokeWidth={4} strokeLinecap="round" fill="none" />
      )}
    </G>
  );
}

function Body({ mood }: { mood: Mood }) {
  const [left, right] = ARMS[mood];
  return (
    <Svg viewBox="0 0 200 200" width="100%" height="100%">
      {/* legs */}
      <Path d="M82 156 V172 H72" stroke={INK} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <Path d="M118 156 V172 H128" stroke={INK} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      {/* arms (behind the body edge) */}
      <Path d={left} stroke={INK} strokeWidth={5} strokeLinecap="round" fill="none" />
      <Path d={right} stroke={INK} strokeWidth={5} strokeLinecap="round" fill="none" />
      {/* butter stick */}
      <Rect x={52} y={46} width={96} height={112} rx={20} fill={BUTTER} stroke={INK} strokeWidth={5} />
      <Rect x={62} y={55} width={56} height={9} rx={4.5} fill="#FFF3B0" opacity={0.95} />
      <Rect x={124} y={55} width={12} height={9} rx={4.5} fill="#FFF3B0" opacity={0.95} />
      {/* paper wrapper with a zig-zag torn edge */}
      <Path
        d="M54.5 126 L66 118 L77.5 126 L89 118 L100 126 L111 118 L122.5 126 L134 118 L145.5 126 V138 Q145.5 155.5 128 155.5 H72 Q54.5 155.5 54.5 138 Z"
        fill="#F6F1DF"
        stroke={INK}
        strokeWidth={4}
        strokeLinejoin="round"
      />
      <Line x1={62} y1={140} x2={138} y2={140} stroke="#D9CFA8" strokeWidth={4} strokeLinecap="round" />
      <Face mood={mood} />
    </Svg>
  );
}

const Coin = () => (
  <Svg viewBox="0 0 48 48" width="100%" height="100%">
    <Circle cx={24} cy={24} r={20} fill="#BFE3F7" stroke={INK} strokeWidth={4} />
    <Circle cx={24} cy={24} r={13} fill="none" stroke="#EAF7FF" strokeWidth={3} />
    <Path d="M24 15 L26.6 21.4 L33 24 L26.6 26.6 L24 33 L21.4 26.6 L15 24 L21.4 21.4 Z" fill="#FFFFFF" />
  </Svg>
);

const Magnifier = () => (
  <Svg viewBox="0 0 64 64" width="100%" height="100%">
    <Line x1={36} y1={36} x2={56} y2={56} stroke={INK} strokeWidth={9} strokeLinecap="round" />
    <Line x1={38} y1={38} x2={54} y2={54} stroke="#B36A2E" strokeWidth={4} strokeLinecap="round" />
    <Circle cx={24} cy={24} r={17} fill="#BFE9FF" fillOpacity={0.55} stroke={INK} strokeWidth={5} />
    <Path d="M14 21 Q17 13 25 12" stroke="#FFFFFF" strokeWidth={3.5} strokeLinecap="round" fill="none" />
  </Svg>
);

const Drop = () => (
  <Svg viewBox="0 0 16 22" width="100%" height="100%">
    <Path d="M8 1.5 C11 7 14.5 10.5 14.5 14.5 A6.5 6.5 0 0 1 1.5 14.5 C1.5 10.5 5 7 8 1.5 Z" fill="#8FD8FF" stroke={INK} strokeWidth={2.5} strokeLinejoin="round" />
  </Svg>
);

const loop = (to: number, ms: number, easing = Easing.inOut(Easing.quad)) => withRepeat(withTiming(to, { duration: ms, easing }), -1, true);

export function Butterfingers({ mood = 'idle', size = 180 }: { mood?: Mood; size?: number }) {
  const still = useReducedMotion();
  const u = size / 200; // one SVG unit in px
  const bob = useSharedValue(0); // body bounce
  const tilt = useSharedValue(0); // body lean (deg)
  const a = useSharedValue(0); // prop animation phase 0..1
  const sweat = useSharedValue(0);

  useEffect(() => {
    for (const v of [bob, tilt, a, sweat]) cancelAnimation(v);
    bob.value = 0;
    tilt.value = mood === 'fumble' ? -14 : 0;
    a.value = 0;
    sweat.value = 0;
    if (still) {
      a.value = mood === 'fumble' ? 1 : mood === 'celebrate' ? 0.6 : 0;
      return;
    }
    if (mood === 'idle') {
      bob.value = loop(1, 1100);
      a.value = loop(1, 520);
      sweat.value = withRepeat(withSequence(withDelay(1400, withTiming(1, { duration: 900, easing: Easing.in(Easing.quad) })), withTiming(0, { duration: 0 })), -1);
    } else if (mood === 'nervous') {
      bob.value = loop(1, 420);
      tilt.value = withRepeat(withSequence(withTiming(-2.5, { duration: 70 }), withTiming(2.5, { duration: 70 })), -1, true);
      a.value = loop(1, 180);
      sweat.value = withRepeat(withSequence(withTiming(1, { duration: 650, easing: Easing.in(Easing.quad) }), withTiming(0, { duration: 0 })), -1);
    } else if (mood === 'celebrate') {
      bob.value = withRepeat(withSequence(withTiming(1, { duration: 260, easing: Easing.out(Easing.quad) }), withTiming(0, { duration: 260, easing: Easing.in(Easing.quad) })), -1);
      a.value = withRepeat(withSequence(withTiming(1, { duration: 520, easing: Easing.out(Easing.quad) }), withTiming(0, { duration: 520, easing: Easing.in(Easing.quad) })), -1);
    } else if (mood === 'fumble') {
      tilt.value = withSequence(withTiming(-22, { duration: 160 }), withTiming(-14, { duration: 240, easing: Easing.out(Easing.back(2)) }));
      a.value = withTiming(1, { duration: 1300, easing: Easing.out(Easing.cubic) });
      sweat.value = withRepeat(withSequence(withDelay(500, withTiming(1, { duration: 800 })), withTiming(0, { duration: 0 })), -1);
    } else {
      bob.value = loop(1, 1400);
      a.value = loop(1, 900);
    }
    return () => {
      for (const v of [bob, tilt, a, sweat]) cancelAnimation(v);
    };
  }, [mood, still, bob, tilt, a, sweat]);

  const bodyStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -bob.value * (mood === 'celebrate' ? 16 : 5) * u + (mood === 'fumble' ? 8 * u : 0) }, { rotate: `${tilt.value}deg` }],
  }));

  const coinStyle = useAnimatedStyle(() => {
    if (mood === 'celebrate') {
      return { transform: [{ translateX: 78 * u }, { translateY: (26 - a.value * 46) * u }, { rotate: `${a.value * 360}deg` }] };
    }
    if (mood === 'fumble') {
      const bounce = Math.abs(Math.sin(a.value * Math.PI * 2.5)) * (1 - a.value) * 26;
      return { transform: [{ translateX: (132 + a.value * 34) * u }, { translateY: (150 - bounce) * u }, { rotate: `${a.value * 540}deg` }] };
    }
    const jitter = mood === 'nervous' ? 7 : 3;
    return { transform: [{ translateX: 146 * u }, { translateY: (58 - a.value * jitter - bob.value * 5) * u }, { rotate: `${(a.value - 0.5) * (mood === 'nervous' ? 26 : 14)}deg` }] };
  });

  const lensStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: (132 + a.value * 10) * u }, { translateY: (44 - a.value * 6 - bob.value * 5) * u }, { rotate: `${-8 + a.value * 10}deg` }],
  }));

  const dropStyle = useAnimatedStyle(() => ({ opacity: sweat.value === 0 ? 0 : 1 - sweat.value * 0.7, transform: [{ translateX: 36 * u }, { translateY: (52 + sweat.value * 34) * u }] }));
  const drop2Style = useAnimatedStyle(() => ({ opacity: sweat.value === 0 ? 0 : 1 - sweat.value * 0.7, transform: [{ translateX: 152 * u }, { translateY: (44 + sweat.value * 30) * u }] }));

  return (
    <View style={{ width: size, height: size }} accessible accessibilityRole="image" accessibilityLabel={LABELS[mood]}>
      <View style={{ position: 'absolute', left: 0, top: 0, width: size, height: size }}>
        <Svg viewBox="0 0 200 200" width="100%" height="100%">
          <Ellipse cx={100} cy={180} rx={50} ry={7} fill="#000000" opacity={0.35} />
        </Svg>
      </View>
      <Animated.View style={[{ position: 'absolute', left: 0, top: 0, width: size, height: size }, bodyStyle]}>
        <Body mood={mood} />
      </Animated.View>
      {mood === 'thinking' ? (
        <Animated.View style={[{ position: 'absolute', left: 0, top: 0, width: 58 * u, height: 58 * u }, lensStyle]}>
          <Magnifier />
        </Animated.View>
      ) : (
        <Animated.View style={[{ position: 'absolute', left: 0, top: 0, width: 44 * u, height: 44 * u }, coinStyle]}>
          <Coin />
        </Animated.View>
      )}
      {mood !== 'celebrate' && mood !== 'thinking' ? (
        <>
          <Animated.View style={[{ position: 'absolute', left: 0, top: 0, width: 13 * u, height: 18 * u }, dropStyle]}>
            <Drop />
          </Animated.View>
          {mood === 'nervous' ? (
            <Animated.View style={[{ position: 'absolute', left: 0, top: 0, width: 13 * u, height: 18 * u }, drop2Style]}>
              <Drop />
            </Animated.View>
          ) : null}
        </>
      ) : null}
    </View>
  );
}
