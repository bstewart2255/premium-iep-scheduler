"use client";

import React, { useState, useEffect } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { Card, CardBody } from "../../../components/ui/card";
import { RescheduleAll } from "../../../components/schedule/reschedule-all";
import { ScheduleNewSessions } from "../../../components/schedule/schedule-new-sessions";
import { UndoSchedule } from "../../../components/schedule/undo-schedule";

interface Student {
  id: string;
  initials: string;
  grade_level: string;
  teacher_name: string;
  sessions_per_week: number;
  minutes_per_session: number;
}

interface ScheduleSession {
  id: string;
  student_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  service_type: string;
}

interface BellSchedule {
  id: string;
  grade_level: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  period_name: string;
}

interface SpecialActivity {
  id: string;
  teacher_name: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  activity_name: string;
}

export default function SchedulePage() {
  const [providerRole, setProviderRole] = useState<string>("");
  const [students, setStudents] = useState<Student[]>([]);
  const [bellSchedules, setBellSchedules] = useState<BellSchedule[]>([]);
  const [specialActivities, setSpecialActivities] = useState<SpecialActivity[]>(
    [],
  );
  const [sessions, setSessions] = useState<ScheduleSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [highlightedStudentId, setHighlightedStudentId] = useState<
    string | null
  >(null);
  const [draggedSession, setDraggedSession] = useState<ScheduleSession | null>(
    null,
  );
  const [conflictSlots, setConflictSlots] = useState<Set<string>>(new Set());
  const [dragOverSlot, setDragOverSlot] = useState<{
    day: number;
    timeSlot: string;
  } | null>(null);

  const supabase = createClientComponentClient();

  // Helper function to format time for display
  const formatTime = (time: string): string => {
    const [hours, minutes] = time.split(":");
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? "PM" : "AM";
    const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  // Check if a session can be moved to a specific time slot
  const checkSlotConflicts = async (
    session: ScheduleSession & { student: Student },
    targetDay: number,
    targetTime: string,
  ): Promise<boolean> => {
    // Convert time format
    const [hours, minutes] = targetTime.split(":");
    const startTime = `${hours}:${minutes}:00`;
    const endTime = new Date();
    endTime.setHours(
      parseInt(hours),
      parseInt(minutes) + session.student.minutes_per_session,
      0,
    );
    const endTimeStr = `${endTime.getHours().toString().padStart(2, "0")}:${endTime.getMinutes().toString().padStart(2, "0")}:00`;

    // Check if extends beyond school hours (3:00 PM)
    if (endTime.getHours() >= 15) {
      return true; // Has conflict
    }

    // Check bell schedule conflicts
    const bellConflict = bellSchedules.some((bell) => {
      const grades = bell.grade_level.split(",").map((g) => g.trim());
      return (
        grades.includes(session.student.grade_level.trim()) &&
        bell.day_of_week === targetDay &&
        hasTimeOverlap(startTime, endTimeStr, bell.start_time, bell.end_time)
      );
    });

    if (bellConflict) return true;

    // Check special activity conflicts
    const activityConflict = specialActivities.some(
      (activity) =>
        activity.teacher_name === session.student.teacher_name &&
        activity.day_of_week === targetDay &&
        hasTimeOverlap(
          startTime,
          endTimeStr,
          activity.start_time,
          activity.end_time,
        ),
    );

    if (activityConflict) return true;

    // REMOVED: One session per day rule check
    // Manual drag-and-drop allows multiple sessions per day

    // Check slot capacity (max 4)
    const slotOccupancy = sessions.filter(
      (s) =>
        s.day_of_week === targetDay &&
        s.id !== session.id &&
        hasTimeOverlap(startTime, endTimeStr, s.start_time, s.end_time),
    ).length;

    if (slotOccupancy >= 4) return true;

    return false; // No conflicts
  };

  // Helper function to check time overlap
  const hasTimeOverlap = (
    start1: string,
    end1: string,
    start2: string,
    end2: string,
  ): boolean => {
    const toMinutes = (time: string) => {
      const [h, m] = time.split(":").map(Number);
      return h * 60 + m;
    };

    const start1Min = toMinutes(start1);
    const end1Min = toMinutes(end1);
    const start2Min = toMinutes(start2);
    const end2Min = toMinutes(end2);

    return !(end1Min <= start2Min || start1Min >= end2Min);
  };

// Handle drag start
const handleDragStart = async (e: React.DragEvent, session: ScheduleSession) => {
  const student = students.find(s => s.id === session.student_id);
  if (!student) return;

  const sessionWithStudent = {
    ...session,
    student
  };

  setDraggedSession(session); // Store the original session

  // Calculate all conflicting slots for this session
  const conflicts = new Set<string>();

  for (let day = 1; day <= 5; day++) {
    for (const timeSlot of timeSlots) {
      const hasConflict = await checkSlotConflicts(sessionWithStudent, day, timeSlot);
      if (hasConflict) {
        conflicts.add(`${day}-${timeSlot}`);
      }
    }
  }

  console.log('Conflicts found:', conflicts.size); // Debug log
  setConflictSlots(conflicts);

  // Set drag effect
  e.dataTransfer.effectAllowed = 'move';
};

// Handle drag end
const handleDragEnd = () => {
  setDraggedSession(null);
  setConflictSlots(new Set());
  setDragOverSlot(null);
};

  // Handle drag over (for drop zones)
  const handleDragOver = (e: React.DragEvent, day: number, timeSlot: string) => {
    e.preventDefault();

    const slotKey = `${day}-${timeSlot}`;

    // Don't allow drop on conflicting slots
    if (conflictSlots.has(slotKey)) {
      e.dataTransfer.dropEffect = 'none';
      return;
    }

    e.dataTransfer.dropEffect = 'move';
    setDragOverSlot({ day, timeSlot });
  };

  // Handle drag leave
  const handleDragLeave = () => {
    setDragOverSlot(null);
  };

// Handle drop
const handleDrop = async (e: React.DragEvent, day: number, timeSlot: string) => {
  e.preventDefault();

  if (!draggedSession) return;

  const slotKey = `${day}-${timeSlot}`;
  if (conflictSlots.has(slotKey)) {
    console.log('Cannot drop on conflict slot:', slotKey);
    return;
  }

  const student = students.find(s => s.id === draggedSession.student_id);
  if (!student) return;

  // Update the session
  await updateSessionTime(draggedSession.id, day, timeSlot, student.minutes_per_session);

  // Clean up drag state
  handleDragEnd();
};

  // Update session time in database
  const updateSessionTime = async (sessionId: string, day: number, startTime: string, duration: number) => {
    const [hours, minutes] = startTime.split(':');
    const startTimeFormatted = `${hours}:${minutes}:00`;

    const endTime = new Date();
    endTime.setHours(parseInt(hours), parseInt(minutes) + duration, 0);
    const endTimeFormatted = `${endTime.getHours().toString().padStart(2, '0')}:${endTime.getMinutes().toString().padStart(2, '0')}:00`;

    const { error } = await supabase
      .from('schedule_sessions')
      .update({
        day_of_week: day,
        start_time: startTimeFormatted,
        end_time: endTimeFormatted
      })
      .eq('id', sessionId);

    if (error) {
      alert('Failed to move session: ' + error.message);
    } else {
      // Refresh the schedule
      fetchData();
    }
  };

  // Fetch all data
  const fetchData = async () => {
    try {
      setLoading(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("No user found");

      console.log("Fetching data for user:", user.id);

      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      if (profile) {
        setProviderRole(profile.role);
        console.log("Provider role:", profile.role);
      }

      const [studentsData, bellData, activitiesData, sessionsData] =
        await Promise.all([
          supabase.from("students").select("*").eq("provider_id", user.id),
          supabase
            .from("bell_schedules")
            .select("*")
            .eq("provider_id", user.id),
          supabase
            .from("special_activities")
            .select("*")
            .eq("provider_id", user.id),
          supabase
            .from("schedule_sessions")
            .select("*")
            .eq("provider_id", user.id),
        ]);

      console.log("Fetched data:", {
        students: studentsData.data?.length || 0,
        bellSchedules: bellData.data?.length || 0,
        specialActivities: activitiesData.data?.length || 0,
        sessions: sessionsData.data?.length || 0,
        sessionDetails: sessionsData.data,
      });

      if (studentsData.data) setStudents(studentsData.data);
      if (bellData.data) setBellSchedules(bellData.data);
      if (activitiesData.data) setSpecialActivities(activitiesData.data);
      if (sessionsData.data) setSessions(sessionsData.data);

      // Debug: Count sessions per student
      const sessionsByStudent = new Map<string, number>();
      sessionsData.data?.forEach((session) => {
        const count = sessionsByStudent.get(session.student_id) || 0;
        sessionsByStudent.set(session.student_id, count + 1);
      });

      console.log("Sessions per student:");
      sessionsByStudent.forEach((count, studentId) => {
        const student = studentsData.data?.find((s) => s.id === studentId);
        console.log(`${student?.initials || studentId}: ${count} sessions`);
      });
      console.log("All sessions with times:");
      sessionsData.data?.forEach((session) => {
        const student = studentsData.data?.find(
          (s) => s.id === session.student_id,
        );
        console.log(
          `${student?.initials}: Day ${session.day_of_week}, ${session.start_time} - ${session.end_time}`,
        );
      });
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Add this after the existing useEffect
  const [unscheduledCount, setUnscheduledCount] = useState(0);

  // Check for unscheduled sessions
  const checkUnscheduledSessions = async () => {
    try {
      const { getUnscheduledSessionsCount } = await import(
        "../../../../lib/supabase/queries/schedule-sessions"
      );
      const count = await getUnscheduledSessionsCount();
      setUnscheduledCount(count);
    } catch (error) {
      console.error("Error checking unscheduled sessions:", error);
    }
  };

  useEffect(() => {
    if (!loading) {
      checkUnscheduledSessions();
    }
  }, [loading, sessions]);

  // Handle session deletion
  const handleDeleteSession = async (sessionId: string) => {
    if (!confirm("Are you sure you want to remove this session?")) {
      return;
    }

    const { error } = await supabase
      .from("schedule_sessions")
      .delete()
      .eq("id", sessionId);

    if (error) {
      alert("Failed to delete session: " + error.message);
    } else {
      fetchData();
    }
  };

  // Define days and time slots
  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
  const timeSlots = Array.from({ length: 16 }, (_, i) => {
    const hour = 8 + Math.floor(i / 2);
    const minute = (i % 2) * 30;
    return `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading schedule...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Page Header */}
        <div className="mb-8">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">
                Weekly Schedule
              </h1>
              <p className="text-gray-600">View and manage sessions</p>
            </div>
            <div className="flex gap-3">
              <ScheduleNewSessions
                onComplete={() => {
                  fetchData();
                  checkUnscheduledSessions();
                }}
              />
              <RescheduleAll
                onComplete={() => {
                  fetchData();
                  checkUnscheduledSessions();
                }}
              />
              <UndoSchedule
                onComplete={() => {
                  fetchData();
                  checkUnscheduledSessions();
                }}
              />
            </div>
          </div>

          {/* Unscheduled Sessions Notification */}
          {unscheduledCount > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <div className="flex items-center">
                <svg
                  className="h-5 w-5 text-amber-400 mr-3"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
                <div className="flex-1">
                  <p className="text-sm font-medium text-amber-800">
                    {unscheduledCount} session
                    {unscheduledCount !== 1 ? "s" : ""} need
                    {unscheduledCount === 1 ? "s" : ""} to be scheduled
                  </p>
                  <p className="text-sm text-amber-700">
                    Click "Re-schedule All Sessions" to update your schedule
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Color Key Legend */}
        <div className="mb-6 bg-white rounded-lg shadow-sm p-4">
          <h3 className="text-sm font-medium text-gray-700 mb-3">
            Grade Levels
          </h3>
          <div className="flex flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-purple-400 rounded"></div>
              <span className="text-sm text-gray-600">K</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-sky-400 rounded"></div>
              <span className="text-sm text-gray-600">1st</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-cyan-400 rounded"></div>
              <span className="text-sm text-gray-600">2nd</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-emerald-400 rounded"></div>
              <span className="text-sm text-gray-600">3rd</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-amber-400 rounded"></div>
              <span className="text-sm text-gray-600">4th</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-rose-400 rounded"></div>
              <span className="text-sm text-gray-600">5th</span>
            </div>
          </div>
        </div>

        {/* Highlighted Student Indicator */}
        {highlightedStudentId && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <svg
                  className="h-5 w-5 text-blue-400 mr-3"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <p className="text-sm font-medium text-blue-800">
                  Highlighting all sessions for{" "}
                  <span className="font-bold">
                    {
                      students.find((s) => s.id === highlightedStudentId)
                        ?.initials
                    }
                  </span>
                </p>
              </div>
              <button
                onClick={() => setHighlightedStudentId(null)}
                className="text-blue-600 hover:text-blue-800 text-sm font-medium"
              >
                Clear highlight
              </button>
            </div>
          </div>
        )}

        {/* Schedule Grid */}
        <Card>
          <CardBody className="p-0">
            {/* Grid Header */}
            <div className="grid grid-cols-6 bg-gray-50 border-b">
              <div className="p-3 font-semibold text-gray-700 text-center border-r">
                Time
              </div>
              {days.map((day) => (
                <div
                  key={day}
                  className="p-3 font-semibold text-gray-700 text-center border-r last:border-r-0"
                >
                  {day}
                </div>
              ))}
            </div>

            {/* Grid Body */}
            <div className="grid grid-cols-6">
              {/* Time Column */}
              <div>
                {timeSlots.map((time) => (
                  <div
                    key={time}
                    className="p-2 text-xs text-gray-500 text-center bg-gray-50 border-r border-b font-medium h-[60px] flex items-center justify-center"
                  >
                    {formatTime(time)}
                  </div>
                ))}
              </div>

              {/* Day Columns */}
              {days.map((day, dayIndex) => {
                // Get all sessions for this day
                const daySessions = sessions.filter(
                  (s) => s.day_of_week === dayIndex + 1,
                );

                // Pre-calculate column positions for all sessions
                const sessionColumns = new Map<string, number>();

                // Create drop zones for each time slot
                const dropZones = timeSlots.map((timeSlot, timeIndex) => {
                  const slotKey = `${dayIndex + 1}-${timeSlot}`;
                  const hasConflict = conflictSlots.has(slotKey);
                  const isHovered = dragOverSlot?.day === dayIndex + 1 && dragOverSlot?.timeSlot === timeSlot;

                  return {
                    timeSlot,
                    timeIndex,
                    hasConflict,
                    isHovered
                  };
                });

                // Sort sessions by start time
                const sortedSessions = [...daySessions].sort((a, b) => {
                  const aStart = a.start_time.substring(0, 5);
                  const bStart = b.start_time.substring(0, 5);
                  return aStart.localeCompare(bStart);
                });

                // For each session, find which column it should go in
                sortedSessions.forEach((session) => {
                  const startTime = session.start_time.substring(0, 5);
                  const endTime = session.end_time.substring(0, 5);

                  // Check each column (0-3) to find the first available one
                  for (let col = 0; col < 4; col++) {
                    // Check if this column is free for this time slot
                    const columnOccupied = sortedSessions.some(
                      (otherSession) => {
                        // Skip if it's the same session or hasn't been assigned yet
                        if (
                          otherSession.id === session.id ||
                          !sessionColumns.has(otherSession.id)
                        ) {
                          return false;
                        }

                        // Skip if it's in a different column
                        if (sessionColumns.get(otherSession.id) !== col) {
                          return false;
                        }

                        // Check if times overlap
                        const otherStart = otherSession.start_time.substring(
                          0,
                          5,
                        );
                        const otherEnd = otherSession.end_time.substring(0, 5);

                        // Convert to minutes for easier comparison
                        const sessionStartMin =
                          parseInt(startTime.split(":")[0]) * 60 +
                          parseInt(startTime.split(":")[1]);
                        const sessionEndMin =
                          parseInt(endTime.split(":")[0]) * 60 +
                          parseInt(endTime.split(":")[1]);
                        const otherStartMin =
                          parseInt(otherStart.split(":")[0]) * 60 +
                          parseInt(otherStart.split(":")[1]);
                        const otherEndMin =
                          parseInt(otherEnd.split(":")[0]) * 60 +
                          parseInt(otherEnd.split(":")[1]);

                        // Check if they overlap
                        return !(
                          sessionEndMin <= otherStartMin ||
                          sessionStartMin >= otherEndMin
                        );
                      },
                    );

                    if (!columnOccupied) {
                      sessionColumns.set(session.id, col);
                      break;
                    }
                  }
                });

                return (
                  <div key={day} className="border-r last:border-r-0 relative">
                    {/* Create a relative container for absolute positioning */}
                    <div
                      className="relative"
                      style={{ height: `${timeSlots.length * 60}px` }}
                    >
                      {daySessions.map((session) => {
                        const student = students.find(
                          (s) => s.id === session.student_id,
                        );
                        const startTime = session.start_time.substring(0, 5);
                        const endTime = session.end_time.substring(0, 5);

                        // Calculate position and height
                        const [startHour, startMin] = startTime
                          .split(":")
                          .map(Number);
                        const [endHour, endMin] = endTime
                          .split(":")
                          .map(Number);

                        const startMinutes = (startHour - 8) * 60 + startMin;
                        const endMinutes = (endHour - 8) * 60 + endMin;
                        const duration = endMinutes - startMinutes;

                        const top = (startMinutes / 30) * 60;
                        const height = (duration / 30) * 60;

                        const gradeColorMap: { [key: string]: string } = {
                          K: "bg-purple-400 hover:bg-purple-500",
                          "1": "bg-sky-400 hover:bg-sky-500",
                          "2": "bg-cyan-400 hover:bg-cyan-500",
                          "3": "bg-emerald-400 hover:bg-emerald-500",
                          "4": "bg-amber-400 hover:bg-amber-500",
                          "5": "bg-rose-400 hover:bg-rose-500",
                        };

                        const gradeColor = student
                          ? gradeColorMap[student.grade_level] || "bg-gray-400"
                          : "bg-gray-400";

                        // Get pre-calculated column position
                        const columnIndex = sessionColumns.get(session.id) ?? 0;

                        const fixedWidth = 28;
                        const gap = 1;
                        const leftOffset = columnIndex * (fixedWidth + gap);

                        const isHighlighted =
                          highlightedStudentId === session.student_id;
                        const highlightClass = isHighlighted
                          ? "ring-2 ring-yellow-400 ring-offset-2"
                          : "";

                            return (
                              <div
                                key={session.id}
                                draggable
                                onDragStart={(e) => handleDragStart(e, session)}
                                onDragEnd={handleDragEnd}
                                className={`absolute ${gradeColor} text-white rounded shadow-sm transition-all hover:shadow-md hover:z-10 group cursor-pointer ${highlightClass} ${draggedSession?.id === session.id ? 'opacity-50' : ''}`}
                                style={{
                                  top: `${top}px`,
                                  height: `${height - 2}px`,
                                  left: `${leftOffset + 2}px`,
                                  width: `${fixedWidth}px`,
                                  padding: '2px',
                                  cursor: 'move',
                                  zIndex: draggedSession?.id === session.id ? 20 : 10
                                }}
                                onClick={() => {
                                  // Toggle highlight - click same student to turn off
                                  setHighlightedStudentId(
                                    highlightedStudentId === session.student_id 
                                      ? null 
                                      : session.student_id
                                  );
                                }}
                              >
                            <div className="flex flex-col h-full">
                              <div className="font-medium text-[10px]">
                                {student?.initials}
                              </div>
                              {height > 40 && (
                                <div className="text-[9px] opacity-90">
                                  {duration}m
                                </div>
                              )}
                            </div>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteSession(session.id);
                                  }}
                                  onMouseDown={(e) => e.stopPropagation()}
                                  className="absolute top-1 right-1 w-4 h-4 bg-red-500 rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white hover:bg-red-600"
                                  title="Remove session"
                                  draggable={false}
                                >
                                  <span className="text-xs leading-none">×</span>
                                </button>
                          </div>
                        );
                      })}
                    </div>

                    {/* Time slot borders and drop zones */}
                    {dropZones.map(({ timeSlot, timeIndex, hasConflict, isHovered }) => (
                      <div
                        key={timeIndex}
                        className={`h-[60px] border-b last:border-b-0 relative ${
                          draggedSession ? 'transition-colors' : ''
                        } ${
                          draggedSession && hasConflict ? 'bg-red-50 border-red-300' : ''
                        } ${
                          draggedSession && !hasConflict && isHovered ? 'bg-blue-50 border-blue-300' : ''
                        }`}
                        onDragOver={(e) => draggedSession && handleDragOver(e, dayIndex + 1, timeSlot)}
                        onDragLeave={handleDragLeave}
                        onDrop={(e) => handleDrop(e, dayIndex + 1, timeSlot)}
                        style={{
                          cursor: draggedSession && !hasConflict ? 'copy' : 'default',
                          position: 'absolute',
                          top: `${timeIndex * 60}px`,
                          left: 0,
                          right: 0,
                          zIndex: draggedSession ? 1 : 0
                        }}
                      >
                        {draggedSession && hasConflict && (
                          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
                            <div className="text-red-500 text-xs font-medium bg-white px-2 py-1 rounded shadow-sm">
                              ✕
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
