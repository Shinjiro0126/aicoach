import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * OSの「視差効果を減らす」設定を尊重するためのフック。
 * true のときはアニメーションを止めて静止表示にフォールバックする。
 */
export function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted && enabled) setReduce(true);
    });
    return () => {
      mounted = false;
    };
  }, []);
  return reduce;
}
