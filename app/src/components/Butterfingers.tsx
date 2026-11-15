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
import Svg, { Circle, Ellipse, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';

import { colors, fonts } from '@/lib/theme';

export type Mood = 'idle' | 'nervous' | 'celebrate' | 'fumble' | 'thinking' | 'slip';

const INK = colors.ink;
const OUTLINE = '#7A5230'; // soft cocoa outline, like the reference art
const FACE = '#3B2A20';
const BUTTER = '#FBE27E'; // creamy butter yellow
const BUTTER_TOP = '#FDF1B0'; // lit top face
const BUTTER_SIDE = '#F2D263'; // shaded side
const WRAP = '#FFF7E3'; // waxy cream wrapper
const WRAP_SIDE = '#EFE3C6'; // wrapper in shade, on the right side
const WRAP_TRIM = '#BFE0F2'; // pale blue trim
const WRAP_TEXT = '#F0A47A'; // peach label type
const LABELS: Record<Mood, string> = {
  idle: 'Butterfingers the butter mascot, holding a coin',
  nervous: 'Butterfingers, sweating nervously',
  celebrate: 'Butterfingers celebrating, tossing a coin in the air',
  fumble: 'Butterfingers slipped and dropped the coin',
  thinking: 'Butterfingers inspecting with a magnifying glass',
  slip: 'Butterfingers slipping, falling over, and getting back up',
};

const ARMS: Record<Mood, [string, string]> = {
  idle: ['M54 106 Q40 112 38 124', 'M146 104 Q160 100 164 86'],
  nervous: ['M54 104 Q38 100 34 88', 'M146 104 Q160 100 164 86'],
  celebrate: ['M54 98 Q38 82 34 62', 'M146 98 Q162 82 166 62'],
  fumble: ['M54 102 Q36 96 26 104', 'M146 102 Q166 106 174 120'],
  thinking: ['M54 108 Q44 122 62 124', 'M146 106 Q158 102 162 92'],
  slip: ['M54 106 Q34 98 28 78', 'M146 106 Q166 98 172 78'],
};

function Face({ mood }: { mood: Mood }) {
  const wide = mood === 'fumble' || mood === 'nervous';
  return (
    <G>
      {/* brows */}
      {mood === 'nervous' || mood === 'fumble' ? (
        <>
          <Path d="M72 80 L90 74" stroke={FACE} strokeWidth={4} strokeLinecap="round" />
          <Path d="M128 80 L110 74" stroke={FACE} strokeWidth={4} strokeLinecap="round" />
        </>
      ) : mood === 'thinking' ? (
        <>
          <Path d="M73 78 L90 78" stroke={FACE} strokeWidth={4} strokeLinecap="round" />
          <Path d="M110 72 L127 76" stroke={FACE} strokeWidth={4} strokeLinecap="round" />
        </>
      ) : null}
      {/* eyes */}
      {mood === 'celebrate' ? (
        <>
          <Path d="M76 95 Q84 83 92 95" stroke={FACE} strokeWidth={5} strokeLinecap="round" fill="none" />
          <Path d="M108 95 Q116 83 124 95" stroke={FACE} strokeWidth={5} strokeLinecap="round" fill="none" />
        </>
      ) : (
        <>
          <Circle cx={84} cy={93} r={wide ? 10.5 : 9.5} fill={wide ? '#FFFFFF' : FACE} stroke={FACE} strokeWidth={wide ? 3 : 0} />
          <Circle cx={116} cy={93} r={wide ? 10.5 : 9.5} fill={wide ? '#FFFFFF' : FACE} stroke={FACE} strokeWidth={wide ? 3 : 0} />
          {wide ? (
            <>
              <Circle cx={mood === 'fumble' ? 87 : 84} cy={mood === 'fumble' ? 96 : 93} r={4} fill={FACE} />
              <Circle cx={mood === 'fumble' ? 119 : 116} cy={mood === 'fumble' ? 96 : 93} r={4} fill={FACE} />
            </>
          ) : (
            <>
              <Circle cx={87.5} cy={89} r={3.6} fill="#FFFFFF" />
              <Circle cx={119.5} cy={89} r={3.6} fill="#FFFFFF" />
              <Circle cx={81} cy={96.5} r={1.7} fill="#FFFFFF" />
              <Circle cx={113} cy={96.5} r={1.7} fill="#FFFFFF" />
            </>
          )}
        </>
      )}
      {/* cheeks */}
      <Ellipse cx={72} cy={105} rx={7.5} ry={5.5} fill="#FF9DAE" opacity={0.7} />
      <Ellipse cx={128} cy={105} rx={7.5} ry={5.5} fill="#FF9DAE" opacity={0.7} />
      {/* mouth */}
      {mood === 'celebrate' ? (
        <Path d="M85 103 Q100 124 115 103 Z" fill="#7A2412" stroke={FACE} strokeWidth={3.5} strokeLinejoin="round" />
      ) : mood === 'fumble' ? (
        <Ellipse cx={100} cy={110} rx={6.5} ry={8.5} fill="#7A2412" stroke={FACE} strokeWidth={3.5} />
      ) : mood === 'nervous' ? (
        <Path d="M87 109 Q93.5 103 100 109 Q106.5 115 113 109" stroke={FACE} strokeWidth={4} strokeLinecap="round" fill="none" />
      ) : mood === 'thinking' ? (
        <Path d="M92 110 Q100 107 107 111" stroke={FACE} strokeWidth={4} strokeLinecap="round" fill="none" />
      ) : (
        <Path d="M91 108 Q100 117 109 108" stroke={FACE} strokeWidth={4} strokeLinecap="round" fill="none" />
      )}
    </G>
  );
}

function Body({ mood }: { mood: Mood }) {
  const [left, right] = ARMS[mood];
  return (
    <Svg viewBox="0 0 200 200" width="100%" height="100%">
      {/* small upright oval feet, tucked under the wrapper */}
      <Ellipse cx={86} cy={163} rx={8.5} ry={12} fill={BUTTER} stroke={OUTLINE} strokeWidth={3.5} />
      <Ellipse cx={114} cy={163} rx={8.5} ry={12} fill={BUTTER} stroke={OUTLINE} strokeWidth={3.5} />
      {/* stubby outlined arms, coming out of the wrapper */}
      <G transform="translate(0 12)">
        <Path d={left} stroke={OUTLINE} strokeWidth={15} strokeLinecap="round" fill="none" />
        <Path d={left} stroke={BUTTER} strokeWidth={8.5} strokeLinecap="round" fill="none" />
        <Path d={right} stroke={OUTLINE} strokeWidth={15} strokeLinecap="round" fill="none" />
        <Path d={right} stroke={BUTTER} strokeWidth={8.5} strokeLinecap="round" fill="none" />
      </G>
      {/* the butter block: shaded right side, soft front face, thick lit top slab */}
      <Path d="M142 60 L156 44 Q161 40 161 47 V136 Q161 143 155 147 L142 154 Z" fill={BUTTER_SIDE} stroke={OUTLINE} strokeWidth={4} strokeLinejoin="round" />
      <Rect x={56} y={56} width={88} height={98} rx={15} fill={BUTTER} stroke={OUTLINE} strokeWidth={4} strokeLinejoin="round" />
      <Path d="M57 60 L71 40 Q74 36 80 36 H150 Q160 36 155 45 L143 59 Q141 61 137 61 H62 Q56 61 57 60 Z" fill={BUTTER_TOP} stroke={OUTLINE} strokeWidth={4} strokeLinejoin="round" />
      {/* the wrapper wraps around the shaded right side too */}
      <Path d="M144 124 L161 111 V137 Q161 144 155 148 L144 156 Z" fill={WRAP_SIDE} stroke={OUTLINE} strokeWidth={3.5} strokeLinejoin="round" />
      <Line x1={146} y1={128} x2={158} y2={118.5} stroke={WRAP_TRIM} strokeWidth={3.5} strokeLinecap="round" />
      <Line x1={147} y1={151.5} x2={156} y2={145.5} stroke={WRAP_TRIM} strokeWidth={3} strokeLinecap="round" />
      {/* wrapper band with blue trim and the label */}
      <Path d="M52.5 124 H147.5 V140 Q147.5 156 130 156 H70 Q52.5 156 52.5 140 Z" fill={WRAP} stroke={OUTLINE} strokeWidth={3.5} strokeLinejoin="round" />
      <Line x1={57} y1={128.5} x2={143} y2={128.5} stroke={WRAP_TRIM} strokeWidth={4} strokeLinecap="round" />
      <Line x1={62} y1={151.5} x2={138} y2={151.5} stroke={WRAP_TRIM} strokeWidth={3.5} strokeLinecap="round" />
      <SvgText x={100} y={143} fontSize={16} fontFamily={fonts.displayHeavy} fontWeight="800" fill={WRAP_TEXT} textAnchor="middle" letterSpacing={0.6}>
        BUTTER
      </SvgText>
      <SvgText x={100} y={148.5} fontSize={4.6} fontFamily={fonts.bodySemi} fontWeight="600" fill={FACE} textAnchor="middle" letterSpacing={1.1}>
        FINGERS
      </SvgText>
      <Face mood={mood} />
    </Svg>
  );
}

const Star = () => (
  <Svg viewBox="0 0 24 24" width="100%" height="100%">
    <Path d="M12 2 L14.6 9.4 L22 12 L14.6 14.6 L12 22 L9.4 14.6 L2 12 L9.4 9.4 Z" fill="#FFE27A" stroke={OUTLINE} strokeWidth={1.6} strokeLinejoin="round" />
  </Svg>
);

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
  const slide = useSharedValue(0); // slip: horizontal glide phase 0..1
  const lie = useSharedValue(0); // slip: 1 while lying on the ground

  useEffect(() => {
    for (const v of [bob, tilt, a, sweat, slide, lie]) cancelAnimation(v);
    bob.value = 0;
    slide.value = 0;
    lie.value = 0;
    tilt.value = mood === 'fumble' ? -14 : 0;
    a.value = 0;
    sweat.value = 0;
    if (still) {
      a.value = mood === 'fumble' ? 1 : mood === 'celebrate' ? 0.6 : 0;
      return;
    }
    if (mood === 'slip') {
      // 3200ms lap: glide, lose footing, fall flat, lie dazed, get back up
      const out = Easing.out(Easing.cubic);
      slide.value = withRepeat(withSequence(withTiming(1, { duration: 600, easing: out }), withTiming(1, { duration: 1800 }), withTiming(0, { duration: 600, easing: Easing.inOut(Easing.quad) }), withTiming(0, { duration: 200 })), -1);
      tilt.value = withRepeat(
        withSequence(
          withTiming(-8, { duration: 600, easing: out }),
          withTiming(-30, { duration: 300, easing: Easing.in(Easing.quad) }),
          withTiming(-88, { duration: 350, easing: Easing.in(Easing.quad) }),
          withTiming(-80, { duration: 100, easing: out }),
          withTiming(-88, { duration: 150, easing: Easing.in(Easing.quad) }),
          withTiming(-88, { duration: 900 }),
          withTiming(0, { duration: 600, easing: Easing.out(Easing.back(1.6)) }),
          withTiming(0, { duration: 200 })
        ),
        -1
      );
      bob.value = withRepeat(withSequence(withTiming(0, { duration: 600 }), withTiming(1, { duration: 300, easing: out }), withTiming(0, { duration: 350, easing: Easing.in(Easing.quad) }), withTiming(0, { duration: 1950 })), -1);
      lie.value = withRepeat(withSequence(withTiming(0, { duration: 1250 }), withTiming(1, { duration: 150 }), withTiming(1, { duration: 1000 }), withTiming(0, { duration: 250 }), withTiming(0, { duration: 550 })), -1);
      a.value = loop(1, 520);
    } else if (mood === 'idle') {
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
      for (const v of [bob, tilt, a, sweat, slide, lie]) cancelAnimation(v);
    };
  }, [mood, still, bob, tilt, a, sweat, slide, lie]);

  const slipX = (slide: number) => (mood === 'slip' ? (slide * 28 - 4) * u : 0);
  const shadowStyle = useAnimatedStyle(() => ({ transform: [{ translateX: slipX(slide.value) }, { scaleX: mood === 'slip' ? 1 - bob.value * 0.2 + lie.value * 0.35 : 1 }] }));
  const bodyStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: slipX(slide.value) }, { translateY: (-bob.value * (mood === 'celebrate' ? 16 : mood === 'slip' ? 14 : 5) + lie.value * 24) * u + (mood === 'fumble' ? 8 * u : 0) }, { rotate: `${tilt.value}deg` }],
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
    return { transform: [{ translateX: (146 + (mood === 'slip' ? slide.value * 28 - 4 : 0)) * u }, { translateY: (58 - a.value * jitter - bob.value * (mood === 'slip' ? 16 : 5)) * u }, { rotate: `${(a.value - 0.5) * (mood === 'nervous' ? 26 : 14)}deg` }] };
  });

  const starA = useAnimatedStyle(() => ({ opacity: lie.value, transform: [{ translateX: (slipX(slide.value) + 70 + Math.cos(a.value * Math.PI) * 12) * u }, { translateY: (70 - Math.sin(a.value * Math.PI) * 6) * u }, { rotate: `${a.value * 180}deg` }] }));
  const starB = useAnimatedStyle(() => ({ opacity: lie.value, transform: [{ translateX: (slipX(slide.value) + 104 - Math.cos(a.value * Math.PI) * 12) * u }, { translateY: (56 + Math.sin(a.value * Math.PI) * 6) * u }, { rotate: `${-a.value * 180}deg` }] }));

  const lensStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: (132 + a.value * 10) * u }, { translateY: (44 - a.value * 6 - bob.value * 5) * u }, { rotate: `${-8 + a.value * 10}deg` }],
  }));

  const dropStyle = useAnimatedStyle(() => ({ opacity: sweat.value === 0 ? 0 : 1 - sweat.value * 0.7, transform: [{ translateX: 36 * u }, { translateY: (52 + sweat.value * 34) * u }] }));
  const drop2Style = useAnimatedStyle(() => ({ opacity: sweat.value === 0 ? 0 : 1 - sweat.value * 0.7, transform: [{ translateX: 152 * u }, { translateY: (44 + sweat.value * 30) * u }] }));

  return (
    <View style={{ width: size, height: size }} accessible accessibilityRole="image" accessibilityLabel={LABELS[mood]}>
      <Animated.View style={[{ position: 'absolute', left: 0, top: 0, width: size, height: size }, shadowStyle]}>
        <Svg viewBox="0 0 200 200" width="100%" height="100%">
          <Ellipse cx={100} cy={180} rx={50} ry={7} fill="#000000" opacity={0.3} />
        </Svg>
      </Animated.View>
      <Animated.View style={[{ position: 'absolute', left: 0, top: 0, width: size, height: size }, bodyStyle]}>
        <Body mood={mood} />
      </Animated.View>
      {mood === 'slip' ? (
        <>
          <Animated.View style={[{ position: 'absolute', left: 0, top: 0, width: 16 * u, height: 16 * u }, starA]}>
            <Star />
          </Animated.View>
          <Animated.View style={[{ position: 'absolute', left: 0, top: 0, width: 12 * u, height: 12 * u }, starB]}>
            <Star />
          </Animated.View>
        </>
      ) : null}
      {mood === 'thinking' ? (
        <Animated.View style={[{ position: 'absolute', left: 0, top: 0, width: 58 * u, height: 58 * u }, lensStyle]}>
          <Magnifier />
        </Animated.View>
      ) : (
        <Animated.View style={[{ position: 'absolute', left: 0, top: 0, width: 44 * u, height: 44 * u }, coinStyle]}>
          <Coin />
        </Animated.View>
      )}
      {mood !== 'celebrate' && mood !== 'thinking' && mood !== 'slip' ? (
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
