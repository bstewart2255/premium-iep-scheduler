import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { Database } from '../../src/types/database';

type Student = Database['public']['Tables']['students']['Row'];
type BellSchedule = Database['public']['Tables']['bell_schedules']['Row'];
type SpecialActivity = Database['public']['Tables']['special_activities']['Row'];
type ScheduleSession = Database['public']['Tables']['schedule_sessions']['Row'];

interface ScheduleSlot {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}

interface SchedulingResult {
  success: boolean;
  scheduledSessions: Omit<ScheduleSession, 'id' | 'created_at'>[];
  unscheduledStudents: Student[];
  errors: string[];
}

export class AutoScheduler {
  private supabase;
  private providerId: string;
  private providerRole: string;

  constructor(providerId: string, providerRole: string) {
    this.supabase = createClientComponentClient<Database>();
    this.providerId = providerId;
    this.providerRole = providerRole;
  }

  // Main scheduling function for a single student
  async scheduleStudent(
    student: Student,
    existingSessions: ScheduleSession[],
    bellSchedules: BellSchedule[],
    specialActivities: SpecialActivity[]
  ): Promise<SchedulingResult> {
    const result: SchedulingResult = {
      success: false,
      scheduledSessions: [],
      unscheduledStudents: [],
      errors: []
    };

    try {
      const sessionsNeeded = student.sessions_per_week;
      const sessionDuration = student.minutes_per_session;

      // Find the best slots for this student
      const availableSlots = await this.findAvailableSlots(
        student,
        sessionDuration,
        sessionsNeeded,
        existingSessions,
        bellSchedules,
        specialActivities
      );

      if (availableSlots.length < sessionsNeeded) {
        result.unscheduledStudents.push(student);
        result.errors.push(`Could only find ${availableSlots.length} of ${sessionsNeeded} required slots for ${student.initials}`);
      }

      // Create session objects for the available slots
      for (let i = 0; i < Math.min(availableSlots.length, sessionsNeeded); i++) {
        const slot = availableSlots[i];
        result.scheduledSessions.push({
          student_id: student.id,
          provider_id: this.providerId,
          day_of_week: slot.dayOfWeek,
          start_time: slot.startTime,
          end_time: slot.endTime,
          service_type: this.providerRole
        });
      }

      console.log(`Created ${result.scheduledSessions.length} sessions for ${student.initials}`);

      result.success = result.scheduledSessions.length === sessionsNeeded;
    } catch (error) {
      result.errors.push(`Error scheduling ${student.initials}: ${error.message}`);
    }

    return result;
  }

  // Find available time slots for a student
  private async findAvailableSlots(
    student: Student,
    duration: number,
    slotsNeeded: number,
    existingSessions: ScheduleSession[],
    bellSchedules: BellSchedule[],
    specialActivities: SpecialActivity[]
  ): Promise<ScheduleSlot[]> {
    console.log(`Finding ${slotsNeeded} slots of ${duration} minutes for student ${student.initials}`);

    const availableSlots: ScheduleSlot[] = [];
    const days = [1, 2, 3, 4, 5]; // Monday through Friday
    const timeSlots = this.generateTimeSlots();
    const scheduledForThisStudent: ScheduleSlot[] = [];

    // Try to distribute sessions across days evenly
    const sessionsByDay = this.countSessionsByDay(existingSessions);
    const sortedDays = days.sort((a, b) => (sessionsByDay[a] || 0) - (sessionsByDay[b] || 0));

    // NEW: Rotate through different starting times to distribute throughout the day
    let timeSlotStartIndex = existingSessions.length % timeSlots.length;

    // Simple single pass - one session per day rule makes this much simpler
    for (const day of sortedDays) {
      if (availableSlots.length >= slotsNeeded) break;

      // Check if we already scheduled this student today
      const alreadyScheduledToday = scheduledForThisStudent.some(slot => slot.dayOfWeek === day);
      if (alreadyScheduledToday) {
        console.log(`Already scheduled on day ${day}, skipping`);
        continue;
      }

      // Start from different time slots to distribute throughout the day
      for (let i = 0; i < timeSlots.length; i++) {
        const timeIndex = (timeSlotStartIndex + i) % timeSlots.length;
        const startTime = timeSlots[timeIndex];
        const endTime = this.addMinutesToTime(startTime, duration);

        // Check if this slot is valid
        const validation = this.validateSlot(
          student,
          day,
          startTime,
          endTime,
          duration,
          existingSessions,
          bellSchedules,
          specialActivities,
          scheduledForThisStudent
        );

        if (validation.valid) {
          const newSlot = {
            dayOfWeek: day,
            startTime,
            endTime
          };
          availableSlots.push(newSlot);
          scheduledForThisStudent.push(newSlot);
          console.log(`Found valid slot: Day ${day}, ${startTime}-${endTime}`);
          break; // Move to next day after finding one slot
        } else {
          console.log(`Invalid slot: Day ${day}, ${startTime}-${endTime} - Reason: ${validation.reason}`);
        }
      }
    }

    if (availableSlots.length < slotsNeeded) {
      console.log(`Only found ${availableSlots.length} of ${slotsNeeded} required slots`);
    }

    return availableSlots;
  }

  // Utility functions
  private generateTimeSlots(): string[] {
    const slots: string[] = [];
    // Generate slots every 15 minutes to allow for flexibility
    for (let hour = 8; hour <= 14; hour++) {
      for (let minute = 0; minute < 60; minute += 15) {
        if (hour === 14 && minute > 30) break; // Stop at 2:30 PM
        slots.push(`${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`);
      }
    }
    return slots;
  }

  private timeToMinutes(time: string): number {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  }

  private addMinutesToTime(time: string, minutesToAdd: number): string {
    const totalMinutes = this.timeToMinutes(time) + minutesToAdd;
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:00`;
  }

  private hasTimeOverlap(start1: string, end1: string, start2: string, end2: string): boolean {
    const start1Min = this.timeToMinutes(start1);
    const end1Min = this.timeToMinutes(end1);
    const start2Min = this.timeToMinutes(start2);
    const end2Min = this.timeToMinutes(end2);

    return !(end1Min <= start2Min || start1Min >= end2Min);
  }

  private countSessionsByDay(sessions: ScheduleSession[]): Record<number, number> {
    const counts: Record<number, number> = {};
    sessions.forEach(session => {
      counts[session.day_of_week] = (counts[session.day_of_week] || 0) + 1;
    });
    return counts;
  }

  private validateSlot(
    student: Student,
    dayOfWeek: number,
    startTime: string,
    endTime: string,
    duration: number,
    existingSessions: ScheduleSession[],
    bellSchedules: BellSchedule[],
    specialActivities: SpecialActivity[],
    scheduledForThisStudent: ScheduleSlot[] = []
  ): { valid: boolean; reason?: string } {
    console.log(`Validating slot for ${student.initials}: Day ${dayOfWeek}, ${startTime}-${endTime} (${duration} min)`);

    // Check if session fits within school hours (before 3:00 PM)
    if (this.timeToMinutes(endTime) > this.timeToMinutes('15:00')) {
      return { valid: false, reason: 'Extends beyond school hours' };
    }

    // Check bell schedule conflicts
    const bellConflicts = bellSchedules.filter(bell => {
      const grades = bell.grade_level.split(',').map(g => g.trim());
      return grades.includes(student.grade_level.trim()) &&
             bell.day_of_week === dayOfWeek &&
             this.hasTimeOverlap(startTime, endTime, bell.start_time, bell.end_time);
    });

    if (bellConflicts.length > 0) {
      return { valid: false, reason: `Conflicts with ${bellConflicts[0].period_name}` };
    }

    // Check special activity conflicts
    const activityConflicts = specialActivities.filter(activity =>
      activity.teacher_name === student.teacher_name &&
      activity.day_of_week === dayOfWeek &&
      this.hasTimeOverlap(startTime, endTime, activity.start_time, activity.end_time)
    );

    if (activityConflicts.length > 0) {
      return { valid: false, reason: `Teacher has ${activityConflicts[0].activity_name}` };
    }

    // Check for same student conflicts
    const studentConflicts = existingSessions.filter(session =>
      session.student_id === student.id &&
      session.day_of_week === dayOfWeek &&
      this.hasTimeOverlap(startTime, endTime, session.start_time, session.end_time)
    );

    if (studentConflicts.length > 0) {
      return { valid: false, reason: 'Student already has a session at this time' };
    }

    // NEW: One session per day rule
    const alreadyScheduledToday = [
      ...existingSessions.filter(s => s.student_id === student.id && s.day_of_week === dayOfWeek),
      ...scheduledForThisStudent.filter(s => s.dayOfWeek === dayOfWeek)
    ].length > 0;

    if (alreadyScheduledToday) {
      return { valid: false, reason: 'Student already scheduled today (one session per day rule)' };
    }

    // Check slot capacity (max 4 for auto-scheduling)
    const slotOccupancy = existingSessions.filter(session =>
      session.day_of_week === dayOfWeek &&
      session.student_id !== student.id &&
      this.hasTimeOverlap(startTime, endTime, session.start_time, session.end_time)
    ).length;

    if (slotOccupancy >= 4) {
      return { valid: false, reason: 'Time slot full' };
    }

    return { valid: true };
  }
}