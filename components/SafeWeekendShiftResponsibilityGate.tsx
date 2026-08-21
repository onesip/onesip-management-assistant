import React from 'react';
import type { Lang, User } from '../types';
import { WeekendShiftResponsibilityGate } from './WeekendShiftResponsibilityGate';

class WeekendResponsibilityBoundary extends React.Component<
  { children: React.ReactNode },
  { failed: boolean }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    console.error('Weekend responsibility module crashed and was isolated', error, info);
  }

  render() {
    if (this.state.failed) return null;
    return this.props.children;
  }
}

export function SafeWeekendShiftResponsibilityGate(props: {
  currentUser: User | null | undefined;
  schedule: any;
  storeId: string;
  lang: Lang;
}) {
  return (
    <WeekendResponsibilityBoundary>
      <div className="relative z-[11500]">
        <WeekendShiftResponsibilityGate {...props} />
      </div>
    </WeekendResponsibilityBoundary>
  );
}
