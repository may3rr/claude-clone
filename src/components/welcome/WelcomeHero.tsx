'use client';

import { useEffect, useState } from 'react';

interface Greeting {
  title: string;
  subtitle: string;
}

const GREETINGS: Record<string, Greeting[]> = {
  midnight: [
    { title: '午夜还在', subtitle: '安静得刚刚好。' },
    { title: '零点了', subtitle: '新的一天从这里开始' },
    { title: '全世界都在睡', subtitle: '就你还在努力。' },
  ],
  deepnight: [
    { title: '凌晨的清醒', subtitle: '要么是失眠，要么是灵感。我们赌后者。' },
    { title: '世界暂停中', subtitle: '这是一天里最安静的时刻。' },
    { title: '你还在啊', subtitle: '佩服。先说说你在做什么。' },
  ],
  predawn: [
    { title: '天还没亮', subtitle: '但你已经在了。' },
    { title: '黎明前的沉默', subtitle: '再过一会儿，鸟就开始叫了。' },
    { title: '最早的一批人', subtitle: '这个时间在线，非英雄即疯子。' },
  ],
  dawn: [
    { title: '清晨好', subtitle: '咖啡先，还是直接开始？' },
    { title: '日出时分', subtitle: '新鲜的一天，从零开始。' },
    { title: '世界醒来之前', subtitle: '宁静的时光是最好的时光。' },
    { title: '喧嚣来临前', subtitle: '这是一天中完全属于你的时刻。' },
  ],
  earlymorning: [
    { title: '上午好', subtitle: '大脑刚热完身，正是好时候。' },
    { title: '晨间工作流', subtitle: '专注力还没被消耗。珍惜它。' },
    { title: '一天最清醒的时段', subtitle: '把难事放在这里做。' },
  ],
  latemorning: [
    { title: '上午进行中', subtitle: '午饭前还有时间。' },
    { title: '思路正热', subtitle: '这个时段的判断往往是对的。' },
    { title: '快到午饭了', subtitle: '再做一件事，然后去吃饭。' },
    { title: '上午由你主宰', subtitle: '哪件事能让今天变得有意义？' },
  ],
  noon: [
    { title: '正午了', subtitle: '吃了吗？' },
    { title: '十二点整', subtitle: '一天过去了一半。剩下一半还不错。' },
    { title: '午饭时间', subtitle: '好好吃饭，下午才有力气。' },
  ],
  earlyafternoon: [
    { title: '饭后的第一件事', subtitle: '别睡着，来聊点什么。' },
    { title: '午后开机', subtitle: '消化中，但大脑还在。' },
    { title: '下午刚刚开始', subtitle: '今天还没结束呢。' },
  ],
  midafternoon: [
    { title: '下午三点', subtitle: '困意和咖啡之间，你选哪个？' },
    { title: '午后低谷', subtitle: '多半是生理现象，不是你的问题。' },
    { title: '撑过这一小时', subtitle: '状态待会儿就回来了。' },
    { title: '第二阵风即将到来', subtitle: '再坚持完成一件事就好。' },
  ],
  lateafternoon: [
    { title: '接近傍晚了', subtitle: '今天完成了什么？' },
    { title: '黄昏前的最后冲刺', subtitle: '还有一点时间。用掉它。' },
    { title: '下班时间快到了', subtitle: '如果你有下班时间的话。' },
  ],
  evening: [
    { title: '晚上好', subtitle: '正式工作结束了吗？' },
    { title: '夜幕降临', subtitle: '某些事情在晚上想得更清楚。' },
    { title: '日落支线任务', subtitle: '有趣的事刚刚开始。' },
    { title: '饭后时光', subtitle: '属于自己的时间，从现在开始。' },
  ],
  night: [
    { title: '加班模式', subtitle: '没有微信消息提醒。只有你与工作。' },
    { title: '静夜思', subtitle: '万物渐归宁静。\n是时候构思更宏大的计划了。' },
    { title: '夜猫子预热', subtitle: '某些绝妙想法总在晚饭后涌现。' },
  ],
  latenight: [
    { title: '挑灯夜战', subtitle: '是绝妙灵感还是糟糕决定？\n只有天亮才知道。' },
    { title: '深夜实验室', subtitle: '业余项目在此刻蜕变为真实成果。' },
    { title: '"再来最后一点..."', subtitle: '每个深夜说过这话的人都懂。' },
    { title: '世界已沉睡', subtitle: '你的大脑仍清醒。' },
  ],
};

function getGreetingByTime(): Greeting {
  const hour = new Date().getHours();
  let period: string;
  if (hour === 0) period = 'midnight';
  else if (hour >= 1 && hour <= 3) period = 'deepnight';
  else if (hour >= 4 && hour <= 5) period = 'predawn';
  else if (hour >= 6 && hour <= 7) period = 'dawn';
  else if (hour >= 8 && hour <= 9) period = 'earlymorning';
  else if (hour >= 10 && hour <= 11) period = 'latemorning';
  else if (hour === 12) period = 'noon';
  else if (hour >= 13 && hour <= 14) period = 'earlyafternoon';
  else if (hour >= 15 && hour <= 16) period = 'midafternoon';
  else if (hour >= 17 && hour <= 18) period = 'lateafternoon';
  else if (hour >= 19 && hour <= 20) period = 'evening';
  else if (hour >= 21 && hour <= 22) period = 'night';
  else period = 'latenight'; // 23

  const list = GREETINGS[period];
  return list[Math.floor(Math.random() * list.length)];
}

type Phase = 'initial' | 'expanding' | 'revealed';

export default function WelcomeHero() {
  const [greeting, setGreeting] = useState<Greeting | null>(null);
  const [phase, setPhase] = useState<Phase>('initial');

  useEffect(() => {
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const g = getGreetingByTime();
    const greetingFrame = requestAnimationFrame(() => {
      setGreeting(g);
      if (prefersReduced) {
        setPhase('revealed');
      }
    });

    if (prefersReduced) {
      return () => {
        cancelAnimationFrame(greetingFrame);
      };
    }

    const t1 = setTimeout(() => setPhase('expanding'), 300);
    const t2 = setTimeout(() => setPhase('revealed'), 1000);
    return () => {
      cancelAnimationFrame(greetingFrame);
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  return (
    <div className="flex items-center justify-center flex-1 px-4 pb-8">
      <div className="flex items-center">
        {/* Logo */}
        <div className="flex-shrink-0 flex items-center justify-center w-16 h-16">
          <svg
            viewBox="0 0 100 100"
            fill="none"
            className="w-14 h-14"
            aria-label="Claude"
          >
            <path
              d="m19.6 66.5 19.7-11 .3-1-.3-.5h-1l-3.3-.2-11.2-.3L14 53l-9.5-.5-2.4-.5L0 49l.2-1.5 2-1.3 2.9.2 6.3.5 9.5.6 6.9.4L38 49.1h1.6l.2-.7-.5-.4-.4-.4L29 41l-10.6-7-5.6-4.1-3-2-1.5-2-.6-4.2 2.7-3 3.7.3.9.2 3.7 2.9 8 6.1L37 36l1.5 1.2.6-.4.1-.3-.7-1.1L33 25l-6-10.4-2.7-4.3-.7-2.6c-.3-1-.4-2-.4-3l3-4.2L28 0l4.2.6L33.8 2l2.6 6 4.1 9.3L47 29.9l2 3.8 1 3.4.3 1h.7v-.5l.5-7.2 1-8.7 1-11.2.3-3.2 1.6-3.8 3-2L61 2.6l2 2.9-.3 1.8-1.1 7.7L59 27.1l-1.5 8.2h.9l1-1.1 4.1-5.4 6.9-8.6 3-3.5L77 13l2.3-1.8h4.3l3.1 4.7-1.4 4.9-4.4 5.6-3.7 4.7-5.3 7.1-3.2 5.7.3.4h.7l12-2.6 6.4-1.1 7.6-1.3 3.5 1.6.4 1.6-1.4 3.4-8.2 2-9.6 2-14.3 3.3-.2.1.2.3 6.4.6 2.8.2h6.8l12.6 1 3.3 2 1.9 2.7-.3 2-5.1 2.6-6.8-1.6-16-3.8-5.4-1.3h-.8v.4l4.6 4.5 8.3 7.5L89 80.1l.5 2.4-1.3 2-1.4-.2-9.2-7-3.6-3-8-6.8h-.5v.7l1.8 2.7 9.8 14.7.5 4.5-.7 1.4-2.6 1-2.7-.6-5.8-8-6-9-4.7-8.2-.5.4-2.9 30.2-1.3 1.5-3 1.2-2.5-2-1.4-3 1.4-6.2 1.6-8 1.3-6.4 1.2-7.9.7-2.6v-.2H49L43 72l-9 12.3-7.2 7.6-1.7.7-3-1.5.3-2.8L24 86l10-12.8 6-7.9 4-4.6-.1-.5h-.3L17.2 77.4l-4.7.6-2-2 .2-3 1-1 8-5.5Z"
              fill="hsl(15 63.1% 59.6%)"
            />
          </svg>
        </div>

        {/* 外层：max-width 展开 */}
        <div
          className="overflow-hidden greeting-transition transition-[max-width] duration-700 ease-out"
          style={{ maxWidth: phase === 'initial' ? 0 : 340 }}
        >
          {/* 内层：opacity + translateX 渐入 */}
          <div
            className="greeting-transition transition-[opacity,transform] duration-500 ease-out"
            style={{
              opacity: phase === 'revealed' ? 1 : 0,
              transform: phase === 'revealed' ? 'translateX(0)' : 'translateX(12px)',
            }}
          >
            <div className="flex items-center pl-5">
              {/* 分隔线 */}
              <div className="w-px h-10 bg-text-400/20 flex-shrink-0" />

              {/* 问候文字 */}
              <div className="pl-5">
                <h1
                  className="text-lg font-medium text-text-100 whitespace-nowrap font-serif"
                >
                  {greeting?.title}
                </h1>
                <p className="text-sm text-text-400 mt-1.5 leading-relaxed max-w-[260px] whitespace-pre-line">
                  {greeting?.subtitle}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
