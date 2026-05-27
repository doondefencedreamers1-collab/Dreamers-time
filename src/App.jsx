import React, { useState, useEffect, useMemo } from 'react';
import { Activity, Users, AlertTriangle, Search, Calendar, BookOpen, TrendingUp, Bell, ChevronRight, ArrowRight, Layers, Radio, Coffee, Phone, Upload, FileSpreadsheet, LogOut, Lock, ShieldCheck, Home, ClipboardList, CalendarOff, UserCheck, ArrowLeft, Send, CheckCircle2, XCircle, AlertCircle, BookMarked, Target, MapPin, Pencil, Copy } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';

// ============ SUPABASE CLIENT ============
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://muvpnatfdfuurrglafpn.supabase.co';
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_5fmVn2sNSvo_r_EjDuZXbw_LIHOuj3E';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ============ DATA ============
// Demo OTP — any phone gets this OTP. In real production: integrate Twilio SMS.
const DEMO_OTP = '1234';

// Normalize phone for comparison — strips spaces, dashes, country code variations
const normalizePhone = (phone) => {
  if (!phone) return '';
  return phone.replace(/\D/g, '').slice(-10); // last 10 digits only
};

// Find user by phone + role — NOW FROM SUPABASE
const findUserByPhone = async (role, phone) => {
  const normalized = normalizePhone(phone);
  if (!normalized || normalized.length !== 10) return null;

  if (role === 'teacher') {
    const { data, error } = await supabase.from('teachers').select('*');
    if (error || !data) return null;
    return data.find(t => normalizePhone(t.phone) === normalized) || null;
  } else {
    const { data, error } = await supabase.from('system_users').select('*').eq('role', role);
    if (error || !data) return null;
    return data.find(u => normalizePhone(u.phone) === normalized) || null;
  }
};

const getISTTime = () => {
  return new Date().toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
};

const getISTSeconds = () => {
  return new Date().toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
};

const getISTDay = () => {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const istDate = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  return days[istDate.getDay()];
};

// ============ NATURAL SORTING HELPERS ============
// Smart string comparator that handles numbers naturally:
//   "NDA 2" < "NDA 10" (not "NDA 10" < "NDA 2" like default sort)
//   "11th A" < "11th B" < "12th A"
//   Uses browser's built-in Intl.Collator with numeric:true
const naturalCompare = (a, b) => {
  const strA = String(a || '').trim();
  const strB = String(b || '').trim();
  return strA.localeCompare(strB, undefined, { numeric: true, sensitivity: 'base' });
};

// Sort an array of objects by a string field (e.g. 'name') alphabetically + naturally
const sortByField = (arr, field) => {
  if (!Array.isArray(arr)) return arr;
  return [...arr].sort((a, b) => naturalCompare(a?.[field], b?.[field]));
};

// Sort time slots by start_time (HH:MM format compares lexically correct)
// "08:00" < "09:00" < "10:00" < "13:00" naturally
const sortTimeSlots = (slots) => {
  if (!Array.isArray(slots)) return slots;
  return [...slots].sort((a, b) => {
    const aTime = a?.startTime || a?.start_time || '';
    const bTime = b?.startTime || b?.start_time || '';
    return aTime.localeCompare(bTime);
  });
};

// Check if a class slot (e.g. "08:00") is currently live based on IST time
// Assumes 1-hour slots: 08:00 slot is live from 08:00-08:59 IST
const isCurrentSlot = (slotTime, currentTime) => {
  if (!slotTime || !currentTime) return false;
  const slotH = parseInt(slotTime.split(':')[0]);
  const currH = parseInt(currentTime.split(':')[0]);
  return currH === slotH;
};

// Returns 'running' | 'completed' | 'upcoming' for a slot based on IST time
const getSlotStatus = (slotTime, currentTime) => {
  if (!slotTime || !currentTime) return 'upcoming';
  const slotH = parseInt(slotTime.split(':')[0]);
  const currH = parseInt(currentTime.split(':')[0]);
  if (currH === slotH) return 'running';
  if (currH > slotH) return 'completed';
  return 'upcoming';
};

// ============ DAY-AWARE CELL HELPERS ============
// Cell keys in DB use format: 'Mon-08:00-NDA 1' (day-time-batch)
// In component state, we group them by day for easier access:
//   cellsByDay = { Mon: {'08:00-NDA 1': data, ...}, Tue: {...}, ... }
// Days supported: Mon, Tue, Wed, Thu, Fri, Sat, Sun

const WEEK_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// Parse a full cell_key 'Mon-08:00-NDA 1' into {day, shortKey}
// shortKey is '08:00-NDA 1' (without day prefix)
const parseCellKey = (fullKey) => {
  const i = fullKey.indexOf('-');
  if (i === -1) return { day: 'Mon', shortKey: fullKey };
  const day = fullKey.substring(0, i);
  if (!WEEK_DAYS.includes(day)) return { day: 'Mon', shortKey: fullKey };
  return { day, shortKey: fullKey.substring(i + 1) };
};

// Build a full cell_key from day + shortKey
const buildCellKey = (day, shortKey) => `${day}-${shortKey}`;

// Group flat cells (with day-prefixed keys) into per-day buckets
// Input: { 'Mon-08:00-NDA 1': data, 'Tue-09:00-12th A': data, ... }
// Output: { Mon: { '08:00-NDA 1': data, ... }, Tue: { '09:00-12th A': data, ... }, ... }
const groupCellsByDay = (cells) => {
  const result = { Mon: {}, Tue: {}, Wed: {}, Thu: {}, Fri: {}, Sat: {}, Sun: {} };
  for (const [key, val] of Object.entries(cells)) {
    const { day, shortKey } = parseCellKey(key);
    if (result[day]) result[day][shortKey] = val;
  }
  return result;
};

const TEACHERS = [
  { id: 1, name: "Praveen Kumar Sir", subjects: ["NDA Mathematics"], wing: "Senior", slots: 9, hours: 10.00, status: "active" , phone: "+91 98765 43210" },
  { id: 2, name: "Shailendra Sir", subjects: ["Physics"], wing: "Senior", slots: 8, hours: 8.00, status: "active" , phone: "+91 98765 43211" },
  { id: 3, name: "Pankaj Rawat Sir", subjects: ["Chemistry"], wing: "Both", slots: 9, hours: 8.00, status: "active" , phone: "+91 98765 43212" },
  { id: 4, name: "Ranjeet Rawat Sir", subjects: ["Polity"], wing: "Senior", slots: 7, hours: 7.50, status: "active" , phone: "+91 98765 43213" },
  { id: 5, name: "Manisha Ma'am", subjects: ["Hindi"], wing: "Junior", slots: 9, hours: 7.25, status: "active" , phone: "+91 98765 43214" },
  { id: 6, name: "Ashish Yadav Sir", subjects: ["English"], wing: "Both", slots: 8, hours: 7.17, status: "active" , phone: "+91 98765 43215" },
  { id: 7, name: "Nitin Verma Sir", subjects: ["English"], wing: "Senior", slots: 7, hours: 7.00, status: "active" , phone: "+91 98765 43216" },
  { id: 8, name: "Devesh Shukla Sir", subjects: ["NDA Mathematics"], wing: "Senior", slots: 5, hours: 7.00, status: "active" , phone: "+91 98765 43217" },
  { id: 9, name: "Deepak Saraswat Sir", subjects: ["History"], wing: "Senior", slots: 7, hours: 7.00, status: "leave" , phone: "+91 98765 43218" },
  { id: 10, name: "Prakash Khandelwal Sir", subjects: ["Geography"], wing: "Senior", slots: 7, hours: 7.00, status: "active" , phone: "+91 98765 43219" },
  { id: 11, name: "Rohan Mishra Sir", subjects: ["English"], wing: "Senior", slots: 7, hours: 7.00, status: "active" , phone: "+91 98765 43220" },
  { id: 12, name: "Devesh Yadav Sir", subjects: ["Physics"], wing: "Senior", slots: 7, hours: 6.75, status: "active" , phone: "+91 98765 43221" },
  { id: 13, name: "Udham Singh Rathi Sir", subjects: ["NDA Maths"], wing: "Senior", slots: 5, hours: 6.50, status: "active" , phone: "+91 98765 43222" },
  { id: 14, name: "Hariom Sharma Sir", subjects: ["Chemistry"], wing: "Senior", slots: 6, hours: 6.00, status: "active" , phone: "+91 98765 43223" },
  { id: 15, name: "Deependra Sir", subjects: ["Geography"], wing: "Senior", slots: 6, hours: 6.00, status: "active" , phone: "+91 98765 43224" },
  { id: 16, name: "Harshit Dahiya Sir", subjects: ["GS", "SST"], wing: "Junior", slots: 7, hours: 5.58, status: "active" , phone: "+91 98765 43225" },
  { id: 17, name: "Ranjan Sir", subjects: ["NDA Maths"], wing: "Senior", slots: 5, hours: 5.50, status: "active" , phone: "+91 98765 43226" },
  { id: 18, name: "Md. Raqib Sir", subjects: ["PD"], wing: "Senior", slots: 5, hours: 5.00, status: "active" , phone: "+91 98765 43227" },
  { id: 19, name: "Yug Chaudhary Sir", subjects: ["Chemistry"], wing: "Senior", slots: 5, hours: 5.00, status: "active" , phone: "+91 98765 43228" },
  { id: 20, name: "Simran Ma'am", subjects: ["Mother Teacher"], wing: "Junior", slots: 1, hours: 4.50, status: "active" , phone: "+91 98765 43229" },
  { id: 21, name: "Aatir Tyagi Sir", subjects: ["Physics"], wing: "Senior", slots: 4, hours: 4.00, status: "active" , phone: "+91 98765 43230" },
  { id: 22, name: "Shantanu Chahar Sir", subjects: ["NDA Maths"], wing: "Senior", slots: 3, hours: 4.00, status: "active" , phone: "+91 98765 43231" },
  { id: 23, name: "Rahul Vashishth Sir", subjects: ["English"], wing: "Senior", slots: 4, hours: 4.00, status: "active" , phone: "+91 98765 43232" },
  { id: 24, name: "Haritosh Nautiyal Sir", subjects: ["Acad Maths"], wing: "Both", slots: 3, hours: 3.75, status: "active" , phone: "+91 98765 43233" },
  { id: 25, name: "Preeti Chaudhary Ma'am", subjects: ["Bio"], wing: "Senior", slots: 3, hours: 3.50, status: "active" , phone: "+91 98765 43234" },
  { id: 26, name: "Ankita Bisht Ma'am", subjects: ["English", "SST"], wing: "Junior", slots: 4, hours: 3.25, status: "active" , phone: "+91 98765 43235" },
  { id: 27, name: "Anil Rawat Sir", subjects: ["Maths"], wing: "Junior", slots: 4, hours: 3.25, status: "active" , phone: "+91 98765 43236" },
  { id: 28, name: "Juhi Mehra Ma'am", subjects: ["English"], wing: "Junior", slots: 4, hours: 3.00, status: "active" , phone: "+91 98765 43237" },
  { id: 29, name: "Himanshu Sir", subjects: ["History"], wing: "Senior", slots: 2, hours: 2.75, status: "active" , phone: "+91 98765 43238" },
  { id: 30, name: "Dushyant Sir", subjects: ["Chemistry"], wing: "Senior", slots: 2, hours: 2.50, status: "active" , phone: "+91 98765 43239" },
  { id: 31, name: "Ruchir Sir", subjects: ["English"], wing: "Senior", slots: 2, hours: 2.00, status: "active" , phone: "+91 98765 43240" },
  { id: 32, name: "Supreet Sir", subjects: ["Uttrakhand"], wing: "Senior", slots: 1, hours: 1.00, status: "active" , phone: "+91 98765 43241" },
  { id: 33, name: "Abhinav Pandey Sir", subjects: ["GS/SSB"], wing: "Senior", slots: 0, hours: 0.00, status: "oncall" , phone: "+91 98765 43242" },
];

const LIVE_CLASSES = [
  { time: "10:30-11:30", batch: "11th B", subject: "Physics", teacher: "Aatir Tyagi Sir", room: "S-203", status: "running", topic: "Newton's 3rd Law" },
  { time: "10:00-11:00", batch: "11th A", subject: "NDA Maths", teacher: "Praveen Kumar Sir", room: "S-101", status: "running", topic: "Quadratic — Practice" },
  { time: "10:00-11:00", batch: "12th C", subject: "Chemistry", teacher: "Pankaj Rawat Sir", room: "S-204", status: "running", topic: "Electrochemistry — Nernst Eq." },
  { time: "10:45-11:30", batch: "Class 10", subject: "Mathematics", teacher: "Anil Rawat Sir", room: "J-105", status: "running", topic: "Coordinate Geometry" },
  { time: "10:30-11:30", batch: "NDA 16 March", subject: "English", teacher: "Nitin Verma Sir", room: "S-202", status: "running", topic: "Reading Comprehension" },
  { time: "11:00-11:45", batch: "Class 5", subject: "English", teacher: "Ankita Bisht Ma'am", room: "J-101", status: "starting", topic: "Tenses Revision" },
];

const CONFLICTS = [
  { severity: "critical", type: "Batch Double-Booking", location: "Class 8 — 12:30-13:30", details: "Ankita Bisht Ma'am (English) and Pankaj Rawat Sir (Chemistry) both scheduled.", suggestion: "Move Chemistry to 13:30" },
  { severity: "critical", type: "Invalid Time Range", location: "Ranjan Sir — JEE Regular", details: "End 17:00 is before start 18:00.", suggestion: "Correct to 17:00–18:00 or 18:00–19:00" },
  { severity: "critical", type: "Missing Schedule", location: "Sumit Shah Sir", details: "No classes recorded.", suggestion: "Add schedule or mark inactive" },
  { severity: "critical", type: "Batch Double-Booking", location: "NDA 20 April 26 — 17:30-18:30", details: "Pankaj Rawat (Chem) & Prakash Khandelwal (Geo) on same batch.", suggestion: "Stagger by 1 hour" },
  { severity: "warning", type: "Hours Mismatch", location: "Ruchir Sir", details: "Reported 7 hrs but only 2 hrs of slots listed.", suggestion: "Reconcile with teacher" },
  { severity: "warning", type: "Batch Double-Booking", location: "RIMC Online — 17:40-18:30", details: "Ashish Yadav (English) & Harshit Dahiya (GS) same batch.", suggestion: "Confirm teacher" },
  { severity: "warning", type: "Hours Mismatch", location: "Manisha Ma'am", details: "Mon-Wed & Thu-Sat summed as 7h 15m.", suggestion: "Split by day-set" },
  { severity: "info", type: "Day-split Rows", location: "9 schedule rows", details: "Rows split Mon-Wed vs Thu-Sat.", suggestion: "Add explicit 'Days' field" },
];

const SUBJECT_BREAKDOWN = [
  { subject: "NDA Mathematics", slots: 26, hours: 33.0 }, { subject: "English", slots: 35, hours: 32.67 },
  { subject: "Chemistry", slots: 22, hours: 21.5 }, { subject: "Physics", slots: 19, hours: 18.75 },
  { subject: "Geography", slots: 13, hours: 13.0 }, { subject: "History", slots: 9, hours: 9.75 },
  { subject: "Polity", slots: 7, hours: 7.5 }, { subject: "Hindi", slots: 9, hours: 7.25 },
  { subject: "PD", slots: 5, hours: 5.0 }, { subject: "Bio", slots: 3, hours: 3.5 },
];

const TIME_BREAKDOWN = [
  { window: "Morning", range: "08:00–12:00", slots: 86, hours: 87.0 },
  { window: "Midday", range: "12:00–14:00", slots: 21, hours: 22.0 },
  { window: "Afternoon", range: "14:00–17:00", slots: 41, hours: 43.08 },
  { window: "Evening", range: "17:00–19:00", slots: 16, hours: 16.67 },
  { window: "Night", range: "19:00+", slots: 1, hours: 2.0 },
];

const FREE_NOW = [
  { name: "Himanshu Sir", subjects: ["History"], freeUntil: "13:00", workload: "Light" },
  { name: "Dushyant Sir", subjects: ["Chemistry"], freeUntil: "12:30", workload: "Light" },
  { name: "Supreet Sir", subjects: ["Uttrakhand"], freeUntil: "EOD", workload: "Very Light" },
  { name: "Rahul Vashishth Sir", subjects: ["English"], freeUntil: "14:30", workload: "Moderate" },
  { name: "Preeti Chaudhary Ma'am", subjects: ["Bio"], freeUntil: "15:00", workload: "Light" },
  { name: "Shantanu Chahar Sir", subjects: ["NDA Maths"], freeUntil: "16:00", workload: "Light" },
];

const SUB_SUGGEST = {
  teacher: "Deepak Saraswat Sir", subject: "History", affectedClasses: 7,
  suggestions: [
    { name: "Himanshu Sir", subject: "History", matchScore: 96, reason: "Same subject · Same wing · Free 11:00-13:00", available: true },
    { name: "Harshit Dahiya Sir", subject: "GS, SST", matchScore: 72, reason: "Adjacent subject · Backup expertise", available: true },
    { name: "Ranjeet Rawat Sir", subject: "Polity", matchScore: 58, reason: "Related · Heavy workload", available: false },
  ]
};

// Initial timetable data — moved to module level so it's shared between TimetableView and ConflictsView
const INITIAL_CELLS = {
  '08:00-11th A': { subj: 'Maths', tch: 'Praveen', room: 'S-101' },
  '09:00-11th A': { subj: 'Eng', tch: 'Ashish', room: 'S-101' },
  '10:00-11th A': { subj: 'Maths', tch: 'Praveen', room: 'S-101' },
  '11:00-11th A': { subj: 'Chem', tch: 'Pankaj', room: 'S-101' },
  '12:00-11th A': { subj: 'Phy', tch: 'Aatir', room: 'S-101' },
  '08:00-11th B': { subj: 'Hist', tch: 'Deepak', room: 'S-203' },
  '09:00-11th B': { subj: 'Eng', tch: 'Ashish', room: 'S-203' },
  '10:00-11th B': { subj: 'Phy', tch: 'Aatir', room: 'S-203', live: true },
  '11:00-11th B': { subj: 'Maths', tch: 'Devesh', room: 'S-203' },
  '14:00-11th B': { subj: 'Geo', tch: 'Prakash', room: 'S-203' },
  '08:00-11th C': { subj: 'Eng', tch: 'Ashish', room: 'S-102' },
  '09:00-11th C': { subj: 'Maths', tch: 'Praveen', room: 'S-102' },
  '11:00-11th C': { subj: 'Phy', tch: 'Shailendra', room: 'LAB-PHY' },
  '13:00-11th C': { subj: 'Chem', tch: 'Hariom', room: 'LAB-CHEM' },
  '08:00-12th A': { subj: 'Pol', tch: 'Ranjeet', room: 'S-205' },
  '09:00-12th A': { subj: 'Maths', tch: 'Shantanu', room: 'S-205' },
  '11:00-12th A': { subj: 'Pol', tch: 'Ranjeet', room: 'S-205', live: true },
  '12:00-12th A': { subj: 'Phy', tch: 'Devesh', room: 'S-205' },
  '08:00-12th C': { subj: 'Chem', tch: 'Pankaj', room: 'S-204' },
  '10:00-12th C': { subj: 'Chem', tch: 'Pankaj', room: 'S-204', live: true },
  '14:00-12th C': { subj: 'Eng', tch: 'Ashish', room: 'S-204' },
  '09:00-NDA 9th': { subj: 'Eng', tch: 'Ashish', room: 'S-103' },
  '10:00-NDA 9th': { subj: 'Maths', tch: 'Anil', room: 'S-103' },
  '11:00-NDA 9th': { subj: 'GS', tch: 'Harshit', room: 'S-103' },
};

// Compute LIVE conflicts from cells data (teacher in 2+ places OR room in 2+ places at same time)
const computeLiveConflicts = (cells) => {
  const conflicts = [];
  const TIMES = ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00'];
  TIMES.forEach(time => {
    const byTeacher = {};
    const byRoom = {};
    Object.entries(cells).forEach(([key, cell]) => {
      if (!key.startsWith(time + '-')) return;
      const batch = key.slice(time.length + 1);
      if (cell.tch) (byTeacher[cell.tch] = byTeacher[cell.tch] || []).push({ batch, key, ...cell });
      if (cell.room) (byRoom[cell.room] = byRoom[cell.room] || []).push({ batch, key, ...cell });
    });
    Object.entries(byTeacher).forEach(([tch, entries]) => {
      if (entries.length > 1) {
        conflicts.push({
          id: `live-teacher-${time}-${tch}`,
          severity: 'critical',
          type: 'TEACHER DOUBLE-BOOKING',
          location: `${time} — ${tch} Sir`,
          details: `${tch} Sir is teaching ${entries.length} batches at the same time: ${entries.map(e => `${e.batch} (${e.subj}, ${e.room})`).join(' · ')}.`,
          suggestion: `Reassign ${entries.length - 1} of these to other available teachers.`,
          isLive: true,
          affectedCells: entries.map(e => e.key),
          time,
        });
      }
    });
    Object.entries(byRoom).forEach(([room, entries]) => {
      if (entries.length > 1) {
        conflicts.push({
          id: `live-room-${time}-${room}`,
          severity: 'critical',
          type: 'ROOM DOUBLE-BOOKING',
          location: `${time} — Room ${room}`,
          details: `Room ${room} is booked for ${entries.length} classes at same time: ${entries.map(e => `${e.batch} (${e.subj} by ${e.tch})`).join(' · ')}.`,
          suggestion: `Change room for ${entries.length - 1} of these classes.`,
          isLive: true,
          affectedCells: entries.map(e => e.key),
          time,
        });
      }
    });
  });
  return conflicts;
};

// Find which cells are part of any conflict (returns Set of keys)
const findConflictingCells = (cells) => {
  const conflictingSet = new Set();
  computeLiveConflicts(cells).forEach(c => c.affectedCells.forEach(k => conflictingSet.add(k)));
  return conflictingSet;
};

// Classroom data — name, wing, capacity (students it can hold), floor
const INITIAL_CLASSROOMS = [
  { id: 1, name: 'S-101', wing: 'Senior', capacity: 60, floor: 'Ground' },
  { id: 2, name: 'S-102', wing: 'Senior', capacity: 60, floor: 'Ground' },
  { id: 3, name: 'S-103', wing: 'Senior', capacity: 80, floor: 'Ground' },
  { id: 4, name: 'S-104', wing: 'Senior', capacity: 60, floor: 'Ground' },
  { id: 5, name: 'S-201', wing: 'Senior', capacity: 60, floor: '1st' },
  { id: 6, name: 'S-202', wing: 'Senior', capacity: 60, floor: '1st' },
  { id: 7, name: 'S-203', wing: 'Senior', capacity: 60, floor: '1st' },
  { id: 8, name: 'S-204', wing: 'Senior', capacity: 60, floor: '1st' },
  { id: 9, name: 'S-205', wing: 'Senior', capacity: 60, floor: '1st' },
  { id: 10, name: 'J-101', wing: 'Junior', capacity: 120, floor: 'Ground' },
  { id: 11, name: 'J-105', wing: 'Junior', capacity: 120, floor: 'Ground' },
  { id: 12, name: 'LAB-CHEM', wing: 'Lab', capacity: 30, floor: '1st' },
  { id: 13, name: 'LAB-PHY', wing: 'Lab', capacity: 30, floor: '1st' },
  { id: 14, name: 'ONLINE-1', wing: 'Online', capacity: 100, floor: '—' },
  { id: 15, name: 'PT-GRD', wing: 'Outdoor', capacity: 200, floor: 'Ground' },
];

// Batch data — name, wing, student strength, class teacher (optional)
const INITIAL_BATCHES = [
  { id: 1, name: '11th A', wing: 'Senior', strength: 45, classTeacher: 'Praveen' },
  { id: 2, name: '11th B', wing: 'Senior', strength: 42, classTeacher: 'Aatir' },
  { id: 3, name: '11th C', wing: 'Senior', strength: 38, classTeacher: 'Ashish' },
  { id: 4, name: '12th A', wing: 'Senior', strength: 40, classTeacher: 'Shantanu' },
  { id: 5, name: '12th C', wing: 'Senior', strength: 35, classTeacher: 'Pankaj' },
  { id: 6, name: 'NDA 9th', wing: 'Junior', strength: 28, classTeacher: 'Anil' },
];

// Topic completion tracking — director's new view
const CHAPTER_PROGRESS = [
  { id: 1, batch: "11th A", subject: "NDA Maths", chapter: "Quadratic Equations", teacher: "Praveen Kumar Sir", sessions: 5, planned: 7, status: "in_progress", pct: 71, startDate: "15 May", lastTaught: "25 May", topics: [
    { name: "Introduction & Standard Form", date: "15 May", status: "done" },
    { name: "Discriminant", date: "20 May", status: "done" },
    { name: "Sum & Product of Roots", date: "22 May", status: "done" },
    { name: "Practice Problems", date: "24 May", status: "done" },
    { name: "Word Problems", date: "25 May", status: "in_progress" },
    { name: "Inequalities", date: "—", status: "pending" },
    { name: "Revision Test", date: "—", status: "pending" },
  ]},
  { id: 2, batch: "11th A", subject: "Physics", chapter: "Laws of Motion", teacher: "Aatir Tyagi Sir", sessions: 4, planned: 4, status: "completed", pct: 100, startDate: "12 May", lastTaught: "22 May", topics: [
    { name: "Newton's 1st Law", date: "12 May", status: "done" },
    { name: "Newton's 2nd Law", date: "15 May", status: "done" },
    { name: "Newton's 3rd Law", date: "18 May", status: "done" },
    { name: "Applications & Numericals", date: "22 May", status: "done" },
  ]},
  { id: 3, batch: "11th B", subject: "Physics", chapter: "Laws of Motion", teacher: "Aatir Tyagi Sir", sessions: 3, planned: 4, status: "in_progress", pct: 75, startDate: "16 May", lastTaught: "25 May", topics: [] },
  { id: 4, batch: "12th C", subject: "Chemistry", chapter: "Electrochemistry", teacher: "Pankaj Rawat Sir", sessions: 6, planned: 8, status: "in_progress", pct: 75, startDate: "10 May", lastTaught: "25 May", topics: [] },
  { id: 5, batch: "12th A", subject: "Polity", chapter: "Fundamental Rights", teacher: "Ranjeet Rawat Sir", sessions: 4, planned: 5, status: "in_progress", pct: 80, startDate: "18 May", lastTaught: "25 May", topics: [] },
  { id: 6, batch: "NDA 9th", subject: "English", chapter: "Tenses", teacher: "Ashish Yadav Sir", sessions: 3, planned: 3, status: "completed", pct: 100, startDate: "14 May", lastTaught: "21 May", topics: [] },
  { id: 7, batch: "11th D", subject: "NDA Maths", chapter: "Trigonometry", teacher: "Praveen Kumar Sir", sessions: 6, planned: 8, status: "in_progress", pct: 75, startDate: "11 May", lastTaught: "25 May", topics: [] },
  { id: 8, batch: "NDA 16 March", subject: "Geography", chapter: "Climatology", teacher: "Prakash Khandelwal Sir", sessions: 2, planned: 5, status: "behind", pct: 40, startDate: "20 May", lastTaught: "24 May", topics: [] },
  { id: 9, batch: "Class 10", subject: "Maths", chapter: "Coordinate Geometry", teacher: "Anil Rawat Sir", sessions: 4, planned: 6, status: "in_progress", pct: 67, startDate: "13 May", lastTaught: "25 May", topics: [] },
  { id: 10, batch: "12th B", subject: "Polity", chapter: "Directive Principles", teacher: "Ranjeet Rawat Sir", sessions: 1, planned: 4, status: "behind", pct: 25, startDate: "23 May", lastTaught: "23 May", topics: [] },
];

const ME = {
  id: 1, name: "Praveen Kumar Sir", subjects: ["NDA Mathematics"], wing: "Senior", phone: "+91 98765 43210",
  todayHours: 10.0, weekHours: 60.0, monthHours: 240.0,
  classes: [
    { id: 1, time: "08:00-09:00", batch: "11th A", room: "S-101", chapter: "Quadratic Equations", plannedTopic: "Discriminant", status: "completed", logged: true, loggedTopic: "Discriminant — Δ = b²-4ac, nature of roots. Class did 8 practice problems.", lastTopic: "Linear Equations Recap", nextTopic: "Sum & Product of Roots", chapterPct: 50 },
    { id: 2, time: "09:30-10:30", batch: "11th D", room: "S-101", chapter: "Trigonometry", plannedTopic: "Identities", status: "completed", logged: true, loggedTopic: "Trig identities sin²+cos²=1 family. Solved 6 examples.", lastTopic: "Basic Ratios", nextTopic: "Heights & Distances", chapterPct: 62 },
    { id: 3, time: "10:00-11:00", batch: "11th A", room: "S-101", chapter: "Quadratic Equations", plannedTopic: "Practice Problems", status: "running", logged: false, lastTopic: "Discriminant", nextTopic: "Sum & Product of Roots", chapterPct: 60 },
    { id: 4, time: "11:30-12:30", batch: "12th B", room: "S-104", chapter: "Calculus", plannedTopic: "Limits — Intro", status: "scheduled", logged: false, lastTopic: "Functions & Domain", nextTopic: "Continuity", chapterPct: 10 },
    { id: 5, time: "14:00-15:00", batch: "NDA 4 May", room: "S-103", chapter: "Algebra", plannedTopic: "Sequences", status: "scheduled", logged: false, lastTopic: "Arithmetic Progressions", nextTopic: "Geometric Progressions", chapterPct: 45 },
    { id: 6, time: "15:30-16:30", batch: "11th C", room: "S-101", chapter: "Quadratic Equations", plannedTopic: "Word Problems", status: "scheduled", logged: false, lastTopic: "Sum & Product", nextTopic: "Inequalities", chapterPct: 80 },
    { id: 7, time: "17:00-18:00", batch: "NDA 13 April", room: "S-102", chapter: "Vectors", plannedTopic: "Introduction", status: "scheduled", logged: false, lastTopic: "Coord Geometry Recap", nextTopic: "Dot Product", chapterPct: 5 },
    { id: 8, time: "18:00-19:00", batch: "NDA Evening", room: "S-102", chapter: "Number System", plannedTopic: "Indices", status: "scheduled", logged: false, lastTopic: "Indices & Surds", nextTopic: "Logarithms", chapterPct: 30 },
  ]
};

// ============ UTILITY COMPONENTS ============
const Stat = ({ label, value, suffix, accent, trend }) => (
  <div className="border border-stone-800 bg-stone-950/60 p-5 hover:border-amber-600/40 transition-all">
    <div className="text-[10px] uppercase tracking-[0.2em] text-stone-500 font-mono mb-3">{label}</div>
    <div className="flex items-baseline gap-1.5">
      <span className={`text-4xl font-light tracking-tight ${accent || 'text-stone-100'}`} style={{fontFamily: 'Fraunces, serif'}}>{value}</span>
      {suffix && <span className="text-xs text-stone-500 font-mono">{suffix}</span>}
    </div>
    {trend && <div className="text-[10px] text-stone-500 mt-2 font-mono">{trend}</div>}
  </div>
);

const Pill = ({ children, variant = 'default' }) => {
  const variants = {
    default: 'bg-stone-800/50 text-stone-400 border-stone-700',
    live: 'bg-emerald-500/10 text-emerald-400 border-emerald-700/50',
    critical: 'bg-red-500/10 text-red-400 border-red-700/50',
    warning: 'bg-amber-500/10 text-amber-400 border-amber-700/50',
    info: 'bg-sky-500/10 text-sky-400 border-sky-700/50',
  };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-[10px] uppercase tracking-wider font-mono border ${variants[variant]}`}>
      {variant === 'live' && <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />}
      {children}
    </span>
  );
};

const SectionHeader = ({ kicker, title, action }) => (
  <div className="flex items-end justify-between mb-5 border-b border-stone-800 pb-3 gap-2 flex-wrap">
    <div>
      {kicker && <div className="text-[10px] uppercase tracking-[0.25em] text-amber-500/70 font-mono mb-1">{kicker}</div>}
      <h2 className="text-2xl text-stone-100 font-light tracking-tight" style={{fontFamily: 'Fraunces, serif'}}>{title}</h2>
    </div>
    {action}
  </div>
);

// ============ LOGIN ============
const LoginScreen = ({ onLogin, teachers = [] }) => {
  const [step, setStep] = useState('role');
  const [role, setRole] = useState(null);
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [matchedUser, setMatchedUser] = useState(null); // user object found by phone
  const [phoneError, setPhoneError] = useState(''); // error message if phone not registered
  const [otpError, setOtpError] = useState(''); // error if OTP wrong
  const [checking, setChecking] = useState(false); // loading state while checking phone

  // Validate phone against registered users for the selected role (now async — checks Supabase)
  const handleSendOTP = async () => {
    setPhoneError('');
    setOtpError('');
    if (phone.length < 10) {
      setPhoneError('Please enter a valid 10-digit mobile number');
      return;
    }
    setChecking(true);
    try {
      const user = await findUserByPhone(role, phone);
      if (!user) {
        const msg = role === 'teacher'
          ? 'Yeh number faculty database mein registered nahi hai. Director/Manager se contact karo.'
          : `Yeh number ${role === 'director' ? 'Director' : 'Manager'} ke roop mein registered nahi hai.`;
        setPhoneError(msg);
        setChecking(false);
        return;
      }
      setMatchedUser(user);
      setOtp('');
      setStep('otp');
    } catch (err) {
      setPhoneError('Database connection error. Please try again.');
      console.error('Login error:', err);
    }
    setChecking(false);
  };

  // Verify OTP and login
  const handleVerifyOTP = () => {
    setOtpError('');
    if (otp.length !== 4) {
      setOtpError('Please enter all 4 digits');
      return;
    }
    if (otp !== DEMO_OTP) {
      setOtpError(`Galat OTP. Demo OTP: ${DEMO_OTP}`);
      return;
    }
    onLogin(role, matchedUser);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 md:p-6 relative overflow-hidden" style={{background: 'radial-gradient(ellipse at center, #0a1f15 0%, #050d09 70%, #000 100%)'}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Italiana&family=Cormorant+Garamond:ital,wght@0,300;0,400;1,300&family=Fraunces:opsz,wght@9..144,300;9..144,400;9..144,500&family=JetBrains+Mono:wght@400;500&display=swap');
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes shimmer { 0%, 100% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } }
        @keyframes pulse-glow { 0%, 100% { opacity: 0.3; } 50% { opacity: 0.55; } }
        .anim-1 { animation: fadeIn 0.8s ease-out both; }
        .anim-2 { animation: fadeIn 0.8s 0.15s ease-out both; }
        .anim-3 { animation: fadeIn 0.8s 0.3s ease-out both; }
        .anim-4 { animation: fadeIn 0.8s 0.45s ease-out both; }
        .anim-5 { animation: fadeIn 0.8s 0.6s ease-out both; }
        .anim-6 { animation: fadeIn 0.8s 0.75s ease-out both; }
        .wordmark { background: linear-gradient(180deg, #ecfdf5 0%, #86efac 25%, #34d399 50%, #10b981 75%, #047857 100%); background-size: 100% 200%; -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; animation: shimmer 6s ease-in-out infinite; }
        .green-glow { box-shadow: 0 0 60px rgba(16, 185, 129, 0.18), inset 0 0 30px rgba(16, 185, 129, 0.04); }
      `}</style>

      {/* Deep ambient emerald glow behind wordmark */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-emerald-500/15 blur-[120px] rounded-full pointer-events-none" style={{animation: 'pulse-glow 4s ease-in-out infinite'}} />

      {/* Secondary deeper glow */}
      <div className="absolute bottom-1/4 left-1/2 -translate-x-1/2 w-[400px] h-[400px] bg-emerald-700/10 blur-[100px] rounded-full pointer-events-none" />

      {/* Grain texture overlay */}
      <div className="absolute inset-0 opacity-[0.08] mix-blend-overlay pointer-events-none" style={{backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`}} />

      {/* Vignette */}
      <div className="absolute inset-0 pointer-events-none" style={{background: 'radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,0.8) 100%)'}} />

      {/* Frame corner ornaments — outer */}
      <div className="absolute top-5 left-5 w-10 h-10 border-t border-l border-emerald-500/30 pointer-events-none" />
      <div className="absolute top-5 right-5 w-10 h-10 border-t border-r border-emerald-500/30 pointer-events-none" />
      <div className="absolute bottom-5 left-5 w-10 h-10 border-b border-l border-emerald-500/30 pointer-events-none" />
      <div className="absolute bottom-5 right-5 w-10 h-10 border-b border-r border-emerald-500/30 pointer-events-none" />

      <div className="relative max-w-md w-full">
        {/* HERALDIC CREST */}
        <div className="flex justify-center mb-3 anim-1">
          <svg viewBox="0 0 100 110" className="w-20 h-22" style={{filter: 'drop-shadow(0 0 14px rgba(16,185,129,0.45))'}}>
            <defs>
              <linearGradient id="gold" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#d1fae5" />
                <stop offset="30%" stopColor="#86efac" />
                <stop offset="60%" stopColor="#10b981" />
                <stop offset="100%" stopColor="#064e3b" />
              </linearGradient>
            </defs>
            {/* Top star */}
            <path d="M50 4 L52.5 11 L60 11 L54 15.5 L56 22.5 L50 18 L44 22.5 L46 15.5 L40 11 L47.5 11 Z" fill="url(#gold)" stroke="url(#gold)" strokeWidth="0.3" />
            {/* Laurel left */}
            <path d="M22 35 Q15 50 18 65 Q22 75 28 80" stroke="url(#gold)" strokeWidth="0.8" fill="none" opacity="0.8" />
            <ellipse cx="20" cy="42" rx="3" ry="1.5" fill="url(#gold)" opacity="0.6" transform="rotate(-25 20 42)" />
            <ellipse cx="18" cy="50" rx="3" ry="1.5" fill="url(#gold)" opacity="0.6" transform="rotate(-15 18 50)" />
            <ellipse cx="19" cy="58" rx="3" ry="1.5" fill="url(#gold)" opacity="0.6" transform="rotate(0 19 58)" />
            <ellipse cx="22" cy="66" rx="3" ry="1.5" fill="url(#gold)" opacity="0.6" transform="rotate(15 22 66)" />
            {/* Laurel right (mirrored) */}
            <path d="M78 35 Q85 50 82 65 Q78 75 72 80" stroke="url(#gold)" strokeWidth="0.8" fill="none" opacity="0.8" />
            <ellipse cx="80" cy="42" rx="3" ry="1.5" fill="url(#gold)" opacity="0.6" transform="rotate(25 80 42)" />
            <ellipse cx="82" cy="50" rx="3" ry="1.5" fill="url(#gold)" opacity="0.6" transform="rotate(15 82 50)" />
            <ellipse cx="81" cy="58" rx="3" ry="1.5" fill="url(#gold)" opacity="0.6" transform="rotate(0 81 58)" />
            <ellipse cx="78" cy="66" rx="3" ry="1.5" fill="url(#gold)" opacity="0.6" transform="rotate(-15 78 66)" />
            {/* Shield outline */}
            <path d="M30 32 L70 32 L70 65 C70 78 60 90 50 94 C40 90 30 78 30 65 Z" stroke="url(#gold)" strokeWidth="1.2" fill="rgba(16,185,129,0.06)" />
            {/* Inner shield line */}
            <path d="M34 36 L66 36 L66 64 C66 75 58 86 50 90 C42 86 34 75 34 64 Z" stroke="url(#gold)" strokeWidth="0.4" fill="none" opacity="0.5" />
            {/* Open book on shield */}
            <path d="M38 56 L50 59 L62 56 L62 71 L50 74 L38 71 Z" stroke="url(#gold)" strokeWidth="0.6" fill="rgba(16,185,129,0.12)" />
            <line x1="50" y1="59" x2="50" y2="74" stroke="url(#gold)" strokeWidth="0.5" />
            <line x1="42" y1="62" x2="48" y2="63.5" stroke="url(#gold)" strokeWidth="0.3" opacity="0.7" />
            <line x1="52" y1="63.5" x2="58" y2="62" stroke="url(#gold)" strokeWidth="0.3" opacity="0.7" />
            <line x1="42" y1="66" x2="48" y2="67.5" stroke="url(#gold)" strokeWidth="0.3" opacity="0.7" />
            <line x1="52" y1="67.5" x2="58" y2="66" stroke="url(#gold)" strokeWidth="0.3" opacity="0.7" />
            {/* Crossed swords behind */}
            <line x1="26" y1="44" x2="42" y2="60" stroke="url(#gold)" strokeWidth="0.7" opacity="0.7" />
            <line x1="74" y1="44" x2="58" y2="60" stroke="url(#gold)" strokeWidth="0.7" opacity="0.7" />
            <circle cx="26" cy="44" r="1.5" fill="url(#gold)" opacity="0.8" />
            <circle cx="74" cy="44" r="1.5" fill="url(#gold)" opacity="0.8" />
            {/* Banner */}
            <path d="M28 96 L72 96 L75 100 L70 102 L72 106 L50 103 L28 106 L30 102 L25 100 Z" stroke="url(#gold)" strokeWidth="0.5" fill="rgba(16,185,129,0.10)" opacity="0.9" />
            <text x="50" y="103" textAnchor="middle" fontSize="3.5" fill="url(#gold)" fontFamily="serif" letterSpacing="0.5">DDD · MMXIX</text>
          </svg>
        </div>

        {/* EST badge */}
        <div className="text-center anim-2">
          <div className="text-[9px] tracking-[0.5em] text-emerald-500/50 font-mono">— EST · MMXIX —</div>
        </div>

        {/* Top ornamental divider */}
        <div className="flex items-center justify-center gap-3 mt-3 anim-3">
          <div className="h-px w-16 bg-gradient-to-r from-transparent via-emerald-600/30 to-emerald-600/60" />
          <svg width="8" height="8" viewBox="0 0 8 8"><path d="M4 0 L5 3 L8 4 L5 5 L4 8 L3 5 L0 4 L3 3 Z" fill="#d4af37" opacity="0.9" /></svg>
          <div className="h-px w-16 bg-gradient-to-l from-transparent via-emerald-600/30 to-emerald-600/60" />
        </div>

        {/* Kicker */}
        <div className="text-center mt-4 anim-3">
          <div className="text-[10px] uppercase tracking-[0.5em] text-emerald-500/80 font-mono">Doon Defence</div>
        </div>

        {/* WORDMARK with gold gradient */}
        <div className="text-center mt-1 anim-3 relative">
          <div className="absolute inset-0 blur-2xl opacity-30 wordmark text-6xl md:text-7xl" style={{fontFamily: "'Italiana', serif"}}>Dreamers</div>
          <h1 className="relative text-6xl md:text-7xl tracking-tight wordmark leading-none" style={{fontFamily: "'Italiana', serif", letterSpacing: '0.01em'}}>Dreamers</h1>
        </div>

        {/* Tagline */}
        <div className="text-center mt-3 anim-4">
          <div className="text-sm text-stone-400 italic" style={{fontFamily: "'Cormorant Garamond', serif", fontWeight: 300, letterSpacing: '0.02em'}}>
            Where future officers begin
          </div>
        </div>

        {/* Subtitle */}
        <div className="text-center mt-1 anim-4">
          <div className="text-[10px] uppercase tracking-[0.4em] text-stone-500 font-mono">Academic Command Center</div>
        </div>

        {/* Bottom ornamental divider */}
        <div className="flex items-center justify-center gap-3 mt-6 mb-8 anim-5">
          <div className="h-px w-20 bg-gradient-to-r from-transparent to-emerald-600/40" />
          <div className="flex gap-1.5">
            <div className="w-1 h-1 bg-emerald-500/60 rotate-45" />
            <div className="w-1.5 h-1.5 bg-emerald-500 rotate-45" />
            <div className="w-1 h-1 bg-emerald-500/60 rotate-45" />
          </div>
          <div className="h-px w-20 bg-gradient-to-l from-transparent to-emerald-600/40" />
        </div>

        {/* CARD with corner ornaments */}
        <div className="relative anim-6">
          {/* Corner ornaments on card */}
          <div className="absolute -top-0.5 -left-0.5 w-3 h-3 border-t border-l border-emerald-500/70 z-10" />
          <div className="absolute -top-0.5 -right-0.5 w-3 h-3 border-t border-r border-emerald-500/70 z-10" />
          <div className="absolute -bottom-0.5 -left-0.5 w-3 h-3 border-b border-l border-emerald-500/70 z-10" />
          <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 border-b border-r border-emerald-500/70 z-10" />

          <div className="border border-stone-800/80 bg-gradient-to-b from-stone-950/95 via-stone-950/90 to-stone-900/80 backdrop-blur-xl p-6 md:p-8 green-glow">
          {step === 'role' && (
            <>
              <div className="text-[10px] uppercase tracking-[0.25em] text-stone-500 font-mono mb-1">Step 01 of 02</div>
              <h2 className="text-2xl text-stone-100 font-light mb-1" style={{fontFamily: 'Fraunces, serif'}}>Choose your <span className="italic text-emerald-300">portal</span></h2>
              <p className="text-stone-500 text-xs mb-6">Each role sees a different dashboard.</p>

              <button onClick={() => { setRole('director'); setStep('phone'); }} className="w-full border border-emerald-700/40 bg-emerald-500/5 hover:bg-emerald-500/10 hover:border-emerald-600/60 p-4 mb-3 text-left transition-all">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 border border-emerald-700/40 bg-emerald-500/10 flex items-center justify-center shrink-0">
                    <ShieldCheck className="w-5 h-5 text-emerald-400" strokeWidth={1.5} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-emerald-300 text-sm">Director / Admin</div>
                    <div className="text-stone-500 text-[11px] mt-0.5">Owner control · entire institute</div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-emerald-500/60 shrink-0" />
                </div>
              </button>

              <button onClick={() => { setRole('manager'); setStep('phone'); }} className="w-full border border-emerald-700/40 bg-emerald-500/5 hover:bg-emerald-500/10 hover:border-emerald-600/60 p-4 mb-3 text-left transition-all">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 border border-emerald-700/40 bg-emerald-500/10 flex items-center justify-center shrink-0">
                    <Calendar className="w-5 h-5 text-emerald-400" strokeWidth={1.5} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-emerald-300 text-sm">Schedule Manager</div>
                    <div className="text-stone-500 text-[11px] mt-0.5">Full timetable control · same dashboard</div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-emerald-500/60 shrink-0" />
                </div>
              </button>

              <button onClick={() => { setRole('teacher'); setStep('phone'); }} className="w-full border border-stone-800 hover:border-stone-700 bg-stone-950/40 hover:bg-stone-900/60 p-4 text-left transition-all">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 border border-stone-800 bg-stone-900 flex items-center justify-center shrink-0">
                    <BookOpen className="w-5 h-5 text-stone-400" strokeWidth={1.5} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-stone-200 text-sm">Teacher / Faculty</div>
                    <div className="text-stone-500 text-[11px] mt-0.5">Personal portal · only your data</div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-stone-500 shrink-0" />
                </div>
              </button>

              <div className="mt-6 border-t border-stone-800 pt-4 flex items-start gap-2">
                <Lock className="w-3 h-3 text-stone-600 mt-0.5 shrink-0" />
                <div className="text-[10px] text-stone-500 leading-relaxed">
                  Director &amp; Schedule Manager see full institute. Teachers see only their own schedule, topics, and leaves — other faculty data is database-locked.
                </div>
              </div>
            </>
          )}

          {step === 'phone' && (
            <>
              <button onClick={() => { setStep('role'); setPhoneError(''); setPhone(''); }} className="text-stone-500 hover:text-stone-300 text-[10px] uppercase tracking-wider font-mono mb-4 flex items-center gap-1">
                <ArrowLeft className="w-3 h-3" /> Back
              </button>
              <div className="text-[10px] uppercase tracking-[0.25em] text-stone-500 font-mono mb-1">Step 02 · {role === 'director' ? 'Director' : role === 'manager' ? 'Schedule Manager' : 'Teacher'} Login</div>
              <h2 className="text-2xl text-stone-100 font-light mb-1" style={{fontFamily: 'Fraunces, serif'}}>Enter your <span className="italic text-emerald-300">mobile</span></h2>
              <p className="text-stone-500 text-xs mb-6">Sirf registered number se login ho payega.</p>

              <div className={`border bg-stone-950 p-4 flex items-center gap-3 mb-2 transition-colors ${phoneError ? 'border-red-700/60' : 'border-stone-800 focus-within:border-emerald-600/40'}`}>
                <Phone className="w-4 h-4 text-stone-500" />
                <span className="text-stone-400 font-mono text-sm">+91</span>
                <input type="tel" maxLength={10} value={phone} onChange={e => { setPhone(e.target.value.replace(/\D/g,'')); setPhoneError(''); }} placeholder="98765 43210" className="flex-1 bg-transparent text-stone-100 font-mono text-sm focus:outline-none placeholder-stone-700 w-full" onKeyDown={e => e.key === 'Enter' && handleSendOTP()} autoFocus />
              </div>

              {phoneError && (
                <div className="border border-red-700/40 bg-red-500/10 p-3 mb-3 flex items-start gap-2">
                  <AlertCircle className="w-3.5 h-3.5 text-red-400 mt-0.5 shrink-0" />
                  <div className="text-[11px] text-red-200 leading-relaxed">{phoneError}</div>
                </div>
              )}

              <button onClick={handleSendOTP} disabled={phone.length < 10 || checking} className={`w-full p-3 text-xs uppercase tracking-wider font-mono border transition-all ${phone.length >= 10 && !checking ? 'border-emerald-600/50 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20' : 'border-stone-800 text-stone-700 cursor-not-allowed'}`}>
                {checking ? 'Checking...' : 'Send OTP →'}
              </button>

              <div className="mt-5 text-[10px] text-stone-600 font-mono text-center leading-relaxed">
                {role === 'teacher'
                  ? 'Number faculty database mein hona chahiye'
                  : 'Pre-registered admin number required'}
              </div>
            </>
          )}

          {step === 'otp' && (
            <>
              <button onClick={() => { setStep('phone'); setOtp(''); setOtpError(''); }} className="text-stone-500 hover:text-stone-300 text-[10px] uppercase tracking-wider font-mono mb-4 flex items-center gap-1">
                <ArrowLeft className="w-3 h-3" /> Change number
              </button>
              <div className="text-[10px] uppercase tracking-[0.25em] text-stone-500 font-mono mb-1">Verify OTP</div>
              <h2 className="text-2xl text-stone-100 font-light mb-1" style={{fontFamily: 'Fraunces, serif'}}>Enter the <span className="italic text-emerald-300">4-digit code</span></h2>
              <p className="text-stone-500 text-xs mb-3">Sent to +91 {phone}. Welcome, <span className="text-emerald-300">{matchedUser?.name}</span></p>

              {/* DEMO OTP HINT — clearly shows it's demo mode */}
              <div className="border border-amber-700/40 bg-amber-500/5 p-3 mb-5 flex items-center gap-2">
                <Lock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <div className="text-[11px] text-amber-200">
                  <span className="font-mono text-amber-300">Demo OTP: {DEMO_OTP}</span> <span className="text-amber-200/70">· Real SMS Phase 2 mein</span>
                </div>
              </div>

              <div className="flex gap-2 justify-center mb-3">
                {[0,1,2,3].map(i => (
                  <input key={i} maxLength={1} value={otp[i] || ''} onChange={e => {
                    const v = e.target.value.replace(/\D/g,'');
                    const newOtp = otp.split('');
                    newOtp[i] = v;
                    setOtp(newOtp.join(''));
                    setOtpError('');
                    if (v && i < 3) e.target.nextElementSibling?.focus();
                  }} onKeyDown={e => e.key === 'Enter' && handleVerifyOTP()} className={`w-12 h-12 md:w-14 md:h-14 border bg-stone-950 text-stone-100 text-center text-2xl font-light focus:outline-none ${otpError ? 'border-red-700/60' : 'border-stone-800 focus:border-emerald-600/60'}`} style={{fontFamily: 'Fraunces, serif'}} autoFocus={i === 0} />
                ))}
              </div>

              {otpError && (
                <div className="border border-red-700/40 bg-red-500/10 p-3 mb-4 flex items-start gap-2">
                  <AlertCircle className="w-3.5 h-3.5 text-red-400 mt-0.5 shrink-0" />
                  <div className="text-[11px] text-red-200">{otpError}</div>
                </div>
              )}

              <button onClick={handleVerifyOTP} disabled={otp.length !== 4} className={`w-full p-3 text-xs uppercase tracking-wider font-mono border transition-all ${otp.length === 4 ? 'border-emerald-600/50 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20' : 'border-stone-800 text-stone-700 cursor-not-allowed'}`}>
                Verify &amp; Enter →
              </button>
            </>
          )}
          </div>
        </div>

        {/* Bottom official seal */}
        <div className="text-center mt-8 anim-6">
          <div className="inline-flex items-center gap-3">
            <div className="h-px w-12 bg-gradient-to-r from-transparent to-emerald-600/30" />
            <svg width="6" height="6" viewBox="0 0 6 6"><rect x="2" y="2" width="2" height="2" fill="#d4af37" opacity="0.6" transform="rotate(45 3 3)" /></svg>
            <div className="text-[9px] uppercase tracking-[0.5em] text-stone-600 font-mono">Dehradun · MMXXVI</div>
            <svg width="6" height="6" viewBox="0 0 6 6"><rect x="2" y="2" width="2" height="2" fill="#d4af37" opacity="0.6" transform="rotate(45 3 3)" /></svg>
            <div className="h-px w-12 bg-gradient-to-l from-transparent to-emerald-600/30" />
          </div>
          <div className="text-[8px] tracking-[0.4em] text-stone-700 font-mono mt-2">A DOON DEFENCE INSTITUTION</div>
        </div>
      </div>
    </div>
  );
};

// ============ DIRECTOR VIEWS ============
const CommandCenter = ({ role = 'director', cells = INITIAL_CELLS, conflicts = CONFLICTS, teachers = TEACHERS, classrooms = INITIAL_CLASSROOMS, batches = INITIAL_BATCHES, currentTime = '08:00', timeSlots = [] }) => {
  const greetingName = role === 'manager' ? 'Manager' : 'Director';
  const [showRollCall, setShowRollCall] = useState(false);
  const [showBrief, setShowBrief] = useState(false);
  const [tickSeconds, setTickSeconds] = useState(getISTSeconds());

  // Local seconds-precision clock for live display (independent of App's 15s tick)
  useEffect(() => {
    const tick = () => setTickSeconds(getISTSeconds());
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, []);

  const istDay = getISTDay();
  const currentHour = parseInt(currentTime.split(':')[0]);
  // Dynamic today's date (IST-aware)
  const istNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const MONTHS_FULL = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const DAYS_FULL = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const todayDate = `${istNow.getDate()} ${MONTHS_FULL[istNow.getMonth()]} ${istNow.getFullYear()}`;
  const todayFullDate = `${DAYS_FULL[istNow.getDay()]}, ${todayDate}`;

  // Helper: get end time for a slot (from time_slots table if available)
  const getSlotEndTime = (startTime) => {
    const slot = timeSlots.find(s => s.startTime === startTime);
    if (slot?.endTime) return slot.endTime;
    // Fallback: assume 1 hour
    const [h, m] = startTime.split(':').map(Number);
    return `${String(h + 1).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  };

  // Helper: resolve short teacher name -> full name from teachers list
  const teacherFullNameLookup = (shortName) => {
    const t = teachers.find(x => (x.shortName || x.name?.split(' ')[0]) === shortName || x.name === shortName);
    return t?.name || (shortName ? `${shortName} Sir` : '');
  };

  // LIVE running classes — REAL data from cells (today's schedule)
  const realLiveClasses = Object.entries(cells)
    .filter(([key, _]) => {
      const slotTime = key.split('-')[0];
      return isCurrentSlot(slotTime, currentTime);
    })
    .map(([key, c]) => {
      const slotTime = key.split('-')[0];
      const batch = key.slice(slotTime.length + 1);
      const endTime = getSlotEndTime(slotTime);
      return {
        time: `${slotTime}-${endTime}`,
        batch,
        subject: c.subj,
        teacher: teacherFullNameLookup(c.tch),
        room: c.room,
        status: 'running',
        topic: '—', // topic logging future feature
      };
    })
    .slice(0, 6); // show top 6

  // LIVE computed numbers — REAL from data
  const runningCount = realLiveClasses.length;
  const teachersTeachingNow = new Set(Object.entries(cells).filter(([key, _]) => isCurrentSlot(key.split('-')[0], currentTime)).map(([_, c]) => c.tch));
  const freeTeachersCount = teachers.filter(t => t.status === 'active' && !teachersTeachingNow.has(t.shortName || t.name.split(' ')[0])).length;
  const liveConflictsRaw = computeLiveConflicts(cells);
  const liveConflictsCount = liveConflictsRaw.length;
  const totalConflictsCount = liveConflictsCount; // only real live conflicts now (no static demo)
  const totalSlots = Object.keys(cells).length;
  const activeTeacherCount = teachers.filter(t => t.status === 'active').length;
  const onLeaveCount = teachers.filter(t => t.status !== 'active').length;
  // Teaching hours (heuristic): 08:00 - 19:00 IST
  const inTeachingHours = currentHour >= 8 && currentHour < 19;
  return (
    <div className="space-y-8">
      <div className="border border-stone-800 bg-gradient-to-br from-stone-950 via-stone-900/50 to-stone-950 p-6 md:p-8 relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(217,164,65,0.08),transparent_60%)]" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2 flex-wrap">
              <Pill variant="live">{inTeachingHours ? 'Classes In Session' : 'Outside Teaching Hours'}</Pill>
              <span className="text-[10px] uppercase tracking-[0.25em] text-stone-500 font-mono flex items-center gap-1.5">
                <span className={`w-1.5 h-1.5 rounded-full ${inTeachingHours ? 'bg-emerald-400 animate-pulse' : 'bg-stone-500'}`} />
                {istDay} · <span className="text-amber-300">{tickSeconds}</span> IST
              </span>
            </div>
            <h1 className="text-4xl md:text-6xl font-light tracking-tight text-stone-50 leading-none" style={{fontFamily: 'Fraunces, serif'}}>
              {currentHour < 12 ? 'Good morning' : currentHour < 17 ? 'Good afternoon' : 'Good evening'}, <span className="italic text-amber-300/90">{greetingName}</span>.
            </h1>
            <p className="text-stone-400 mt-3 max-w-xl text-sm leading-relaxed">
              {inTeachingHours ? (
                <>{runningCount} class{runningCount !== 1 ? 'es' : ''} running. {freeTeachersCount} teacher{freeTeachersCount !== 1 ? 's' : ''} free this hour. {totalConflictsCount} conflict{totalConflictsCount !== 1 ? 's' : ''} need{totalConflictsCount === 1 ? 's' : ''} attention.</>
              ) : (
                <>Teaching hours start at 08:00 IST. {totalConflictsCount} conflict{totalConflictsCount !== 1 ? 's' : ''} pending review. {teachers.length} faculty members on roster.</>
              )}
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => setShowRollCall(true)} className="border border-amber-600/40 bg-amber-500/5 hover:bg-amber-500/10 px-4 py-2 text-xs uppercase tracking-wider text-amber-300 font-mono transition-colors flex items-center gap-2">
              <Radio className="w-3 h-3" /> Live Roll Call
            </button>
            <button onClick={() => setShowBrief(true)} className="border border-stone-700 hover:border-stone-600 px-4 py-2 text-xs uppercase tracking-wider text-stone-300 font-mono">Daily Brief</button>
          </div>
        </div>
      </div>

      <div>
        <div className="text-[10px] uppercase tracking-[0.25em] text-stone-500 font-mono mb-3">— At a glance · {todayDate}</div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-px bg-stone-800">
          <Stat label="Classes Today" value={String(totalSlots)} suffix={totalSlots === 1 ? "slot" : "slots"} trend={`${(totalSlots).toFixed(0)} scheduled`} />
          <Stat label="Running Now" value={String(runningCount)} suffix={runningCount === 1 ? "active" : "active"} accent="text-emerald-300" trend={inTeachingHours ? `Live · ${tickSeconds}` : 'Off hours'} />
          <Stat label="Active Teachers" value={String(activeTeacherCount)} suffix={`of ${teachers.length}`} trend={`${onLeaveCount} on leave`} />
          <Stat label="Free This Hour" value={String(freeTeachersCount)} suffix="available" accent="text-sky-300" trend={inTeachingHours ? 'Right now' : 'Off hours'} />
          <Stat label="Conflicts" value={String(liveConflictsCount)} suffix={liveConflictsCount === 1 ? "issue" : "issues"} accent={liveConflictsCount > 0 ? "text-red-400" : "text-emerald-300"} trend={liveConflictsCount === 0 ? '✓ all clear' : 'Needs attention'} />
          <Stat label="Rooms" value={String(classrooms.length)} suffix={`of ${classrooms.length}`} accent="text-amber-300" trend={`${batches.length} batches`} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <SectionHeader kicker="Module 01" title="Live running classes" action={<Pill variant="live">{runningCount} {runningCount === 1 ? 'ongoing' : 'ongoing'}</Pill>} />
          <div className="border border-stone-800 bg-stone-950/40 overflow-x-auto">
            <div className="grid grid-cols-12 px-4 py-2 border-b border-stone-800 text-[10px] uppercase tracking-wider text-stone-500 font-mono min-w-[640px]">
              <div className="col-span-2">Time</div>
              <div className="col-span-2">Batch</div>
              <div className="col-span-3">Teacher</div>
              <div className="col-span-4">Topic</div>
              <div className="col-span-1 text-right">Room</div>
            </div>
            {realLiveClasses.length === 0 ? (
              <div className="px-4 py-8 text-center text-stone-500 text-sm">
                {inTeachingHours ? 'No classes running right now.' : 'Off teaching hours · classes start at 08:00 IST.'}
              </div>
            ) : realLiveClasses.map((c, i) => (
              <div key={i} className="grid grid-cols-12 px-4 py-3 border-b border-stone-800/50 hover:bg-stone-900/40 transition-colors items-center text-sm min-w-[640px]">
                <div className="col-span-2 font-mono text-xs text-stone-400">{c.time}</div>
                <div className="col-span-2 text-stone-200 text-xs">{c.batch}</div>
                <div className="col-span-3">
                  <div className="text-stone-100 text-sm">{c.teacher}</div>
                  <div className="text-stone-500 text-[10px] uppercase tracking-wider font-mono mt-0.5">{c.subject}</div>
                </div>
                <div className="col-span-4 text-stone-400 text-xs italic" style={{fontFamily: 'Fraunces, serif'}}>{c.topic}</div>
                <div className="col-span-1 text-right">
                  <span className="font-mono text-xs text-amber-300/80">{c.room}</span>
                  <div className="text-[9px] text-emerald-400 mt-0.5">● LIVE</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <SectionHeader kicker="Module 05" title="Conflict alerts" action={liveConflictsCount > 0 ? <Pill variant="critical">{liveConflictsCount} {liveConflictsCount === 1 ? 'issue' : 'issues'}</Pill> : <Pill variant="live">All clear</Pill>} />
          <div className="space-y-2">
            {liveConflictsRaw.length === 0 ? (
              <div className="border border-emerald-700/30 bg-emerald-500/5 p-4 text-emerald-300/80 text-xs">
                ✓ No conflicts detected in today's schedule.
              </div>
            ) : liveConflictsRaw.slice(0, 4).map((c, i) => (
              <div key={i} className="border-l-2 border-l-red-500 border-y border-r border-stone-800 bg-stone-950/40 p-3 hover:bg-stone-900/40 transition-colors cursor-pointer">
                <div className="flex items-start justify-between mb-1.5">
                  <span className="text-[10px] uppercase tracking-wider font-mono text-red-400">{c.type || 'Conflict'}</span>
                  <ChevronRight className="w-3.5 h-3.5 text-stone-600" />
                </div>
                <div className="text-stone-200 text-xs mb-1">{c.location || c.title || 'Conflict'}</div>
                <div className="text-stone-500 text-[11px] leading-relaxed">{c.details || c.description || ''}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div>
        <SectionHeader kicker="Module 02" title="Teacher workload — top performers" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-stone-800">
          {TEACHERS.slice(0, 10).map((t, i) => {
            const pct = Math.min(100, (t.hours / 10) * 100);
            const isOverload = t.hours >= 8;
            return (
              <div key={t.id} className="bg-stone-950/60 p-4 hover:bg-stone-900/60 transition-colors">
                <div className="flex items-center justify-between mb-2 gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`text-xs font-mono shrink-0 ${i < 3 ? 'text-amber-400' : 'text-stone-600'}`}>#{String(i+1).padStart(2,'0')}</div>
                    <div className="min-w-0">
                      <div className="text-stone-100 text-sm truncate">{t.name}</div>
                      <div className="text-stone-500 text-[10px] uppercase tracking-wider font-mono mt-0.5 truncate">{t.subjects.join(' · ')} · {t.wing}</div>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className={`text-2xl font-light ${isOverload ? 'text-amber-300' : 'text-stone-200'}`} style={{fontFamily: 'Fraunces, serif'}}>{t.hours.toFixed(1)}</div>
                    <div className="text-[9px] uppercase tracking-wider text-stone-500 font-mono">hrs · {t.slots}</div>
                  </div>
                </div>
                <div className="h-1 bg-stone-900 overflow-hidden">
                  <div className={`h-full ${isOverload ? 'bg-amber-500/60' : 'bg-stone-600'}`} style={{width: `${pct}%`}} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* LIVE ROLL CALL MODAL */}
      {showRollCall && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur z-50 flex items-center justify-center p-4" onClick={() => setShowRollCall(false)}>
          <div className="w-full max-w-2xl bg-stone-950 border border-amber-700/40 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-stone-800 flex items-center justify-between sticky top-0 bg-stone-950 z-10">
              <div>
                <div className="text-[10px] uppercase tracking-[0.25em] text-emerald-400 font-mono mb-1 flex items-center gap-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full ${inTeachingHours ? 'bg-emerald-400 animate-pulse' : 'bg-stone-500'}`} /> Live · {tickSeconds} IST · {istDay}
                </div>
                <h2 className="text-2xl text-stone-100 font-light" style={{fontFamily: 'Fraunces, serif'}}>Roll Call</h2>
                <div className="text-stone-500 text-xs mt-0.5">
                  {liveClasses.length > 0
                    ? `${liveClasses.length} class${liveClasses.length !== 1 ? 'es' : ''} running right now (${currentTime.split(':')[0]}:00 slot)`
                    : inTeachingHours
                      ? `No classes scheduled for ${currentTime.split(':')[0]}:00 IST slot`
                      : 'Teaching hours: 08:00 to 16:00 IST'}
                </div>
              </div>
              <button onClick={() => setShowRollCall(false)} className="text-stone-500 hover:text-stone-300">
                <XCircle className="w-5 h-5" />
              </button>
            </div>
            <div className="divide-y divide-stone-800">
              {liveClasses.length === 0 ? (
                <div className="p-8 text-center">
                  <div className="text-stone-400 text-sm" style={{fontFamily: 'Fraunces, serif'}}>Abhi koi class running nahi hai</div>
                  <div className="text-stone-600 text-[11px] mt-1">
                    {inTeachingHours
                      ? `${currentTime.split(':')[0]}:00 IST slot mein koi class assigned nahi hai`
                      : `Current IST time ${tickSeconds} — outside teaching hours (08:00-16:00)`}
                  </div>
                </div>
              ) : liveClasses.map(([key, c], i) => {
                const startTime = key.split('-')[0];
                const batch = key.slice(startTime.length + 1);
                const fullTeacher = teachers.find(t => t.name.split(' ')[0] === c.tch)?.name || `${c.tch} Sir`;
                return (
                  <div key={i} className="p-4 hover:bg-stone-900/40 transition-colors">
                    <div className="flex items-center gap-3 mb-1.5 flex-wrap">
                      <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse shrink-0" />
                      <span className="font-mono text-xs text-stone-400">{startTime} - {(parseInt(startTime.split(':')[0])+1).toString().padStart(2,'0')}:00</span>
                      <span className="text-amber-300 text-xs font-mono">📍 {c.room}</span>
                      <Pill variant="live">In Progress</Pill>
                    </div>
                    <div className="text-stone-100 text-sm" style={{fontFamily: 'Fraunces, serif'}}>{batch} · {c.subj}</div>
                    <div className="text-stone-500 text-xs mt-0.5">{fullTeacher} <span className="italic">— teaching now</span></div>
                  </div>
                );
              })}
            </div>
            <div className="p-4 border-t border-stone-800 bg-stone-900/40 text-[10px] uppercase tracking-wider text-stone-500 font-mono text-center">
              Auto-refreshes every 15 seconds · Detection based on IST time
            </div>
          </div>
        </div>
      )}

      {/* DAILY BRIEF MODAL */}
      {showBrief && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur z-50 flex items-center justify-center p-4" onClick={() => setShowBrief(false)}>
          <div className="w-full max-w-2xl bg-stone-950 border border-amber-700/40 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-stone-800 flex items-center justify-between">
              <div>
                <div className="text-[10px] uppercase tracking-[0.25em] text-amber-500/70 font-mono mb-1">Daily Brief · {todayDate}</div>
                <h2 className="text-2xl text-stone-100 font-light" style={{fontFamily: 'Fraunces, serif'}}>Today at a glance</h2>
              </div>
              <button onClick={() => setShowBrief(false)} className="text-stone-500 hover:text-stone-300">
                <XCircle className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-5">
              <div>
                <div className="text-[10px] uppercase tracking-[0.25em] text-amber-500/70 font-mono mb-2">📊 Numbers (live)</div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                  <div className="border border-stone-800 p-3"><div className="text-stone-500 text-[10px]">Slots Assigned</div><div className="text-2xl text-amber-300 font-light" style={{fontFamily: 'Fraunces, serif'}}>{totalSlots}</div></div>
                  <div className="border border-stone-800 p-3"><div className="text-stone-500 text-[10px]">Teachers Active</div><div className="text-2xl text-stone-100 font-light" style={{fontFamily: 'Fraunces, serif'}}>{teachers.length}</div></div>
                  <div className="border border-stone-800 p-3"><div className="text-stone-500 text-[10px]">Classrooms</div><div className="text-2xl text-stone-100 font-light" style={{fontFamily: 'Fraunces, serif'}}>{classrooms.length}</div></div>
                  <div className="border border-stone-800 p-3"><div className="text-stone-500 text-[10px]">Batches</div><div className="text-2xl text-sky-300 font-light" style={{fontFamily: 'Fraunces, serif'}}>{batches.length}</div></div>
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-[0.25em] text-amber-500/70 font-mono mb-2">⚠️ Needs Action</div>
                <ul className="space-y-1.5 text-xs text-stone-300">
                  <li className="flex items-start gap-2"><span className="text-red-400 mt-0.5">●</span> <span><b>1 teacher on leave</b> — Deepak Saraswat Sir (History). Substitute Himanshu Sir suggested (96% match).</span></li>
                  <li className="flex items-start gap-2"><span className="text-red-400 mt-0.5">●</span> <span><b>3 critical conflicts</b> in schedule — Apply fix from Conflicts tab.</span></li>
                  <li className="flex items-start gap-2"><span className="text-amber-400 mt-0.5">●</span> <span><b>2 batches behind syllabus</b> — NDA 16 March (Climatology 40%), 12th B (Directive Principles 25%).</span></li>
                  <li className="flex items-start gap-2"><span className="text-sky-400 mt-0.5">●</span> <span><b>42 of 165 classes</b> have topic logged today — remind teachers via WhatsApp.</span></li>
                </ul>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-[0.25em] text-amber-500/70 font-mono mb-2">✨ Highlights</div>
                <ul className="space-y-1.5 text-xs text-stone-300">
                  <li>• <b className="text-amber-300">Praveen Kumar Sir</b> teaching highest hours today: 10 hr (9 slots)</li>
                  <li>• <b className="text-emerald-300">11th A — Laws of Motion</b> chapter completed by Aatir Sir in 4 sessions</li>
                  <li>• <b className="text-stone-200">51% load</b> concentrated in morning 8-12 — consider redistribution</li>
                </ul>
              </div>
            </div>
            <div className="p-4 border-t border-stone-800 flex gap-2 justify-end flex-wrap">
              <button onClick={() => setShowBrief(false)} className="px-4 py-2 text-[10px] uppercase tracking-wider font-mono border border-stone-700 text-stone-400">Close</button>
              <button onClick={() => { alert('Brief will be sent to your WhatsApp at 8 PM daily (real deploy will integrate WhatsApp Business API).'); setShowBrief(false); }} className="px-4 py-2 text-[10px] uppercase tracking-wider font-mono border border-amber-600/50 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20">Send to WhatsApp</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const TeachersView = ({ photos = {}, teachers = [], setTeachers = () => {}, classrooms = [], setClassrooms = () => {}, batches = [], setBatches = () => {}, cells = {}, addTeacherToDB = async () => {}, updateTeacherInDB = async () => {}, deleteTeacherFromDB = async () => {}, addRoomToDB = async () => {}, updateRoomInDB = async () => {}, deleteRoomFromDB = async () => {}, addBatchToDB = async () => {}, updateBatchInDB = async () => {}, deleteBatchFromDB = async () => {}, timeSlots = [], addTimeSlotToDB = async () => {}, updateTimeSlotInDB = async () => {}, deleteTimeSlotFromDB = async () => {} }) => {
  const [activeTab, setActiveTab] = useState('teachers'); // 'teachers' | 'classrooms' | 'batches' | 'slots'
  const [wingFilter, setWingFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [contactTeacher, setContactTeacher] = useState(null);
  const [showAddTeacher, setShowAddTeacher] = useState(false);
  const [showAddRoom, setShowAddRoom] = useState(false);
  const [showAddBatch, setShowAddBatch] = useState(false);
  const [newTeacher, setNewTeacher] = useState({ name: '', subject: '', wing: 'Senior', phone: '+91 ' });
  const [newRoom, setNewRoom] = useState({ name: '', wing: 'Senior', capacity: 60, floor: 'Ground' });
  const [newBatch, setNewBatch] = useState({ name: '', wing: 'Senior', strength: 30, classTeacher: '' });
  // EDIT STATE — one editing object per entity type
  const [editTeacher, setEditTeacher] = useState(null); // editing teacher object (full)
  const [editRoom, setEditRoom] = useState(null); // editing room object
  const [editBatch, setEditBatch] = useState(null); // editing batch object
  // TIME SLOTS state
  const [showAddSlot, setShowAddSlot] = useState(false);
  const [newSlot, setNewSlot] = useState({ startTime: '08:00', endTime: '09:00', label: 'Period', isBreak: false });
  const [editSlot, setEditSlot] = useState(null); // editing time slot object
  const [toast, setToast] = useState(null);

  // LIVE workload computed from cells (slots/hours derived, not static)
  const teachersWithLiveWorkload = teachers.map(t => {
    const firstName = t.name.split(' ')[0];
    const liveSlots = Object.values(cells).filter(c => c.tch === firstName).length;
    return { ...t, slots: liveSlots, hours: liveSlots };
  });
  const filtered = teachersWithLiveWorkload.filter(t => (wingFilter === 'All' || t.wing === wingFilter) && t.name.toLowerCase().includes(search.toLowerCase()));

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  const addTeacher = async () => {
    if (!newTeacher.name.trim()) { alert('Teacher name is required'); return; }
    if (!newTeacher.subject.trim()) { alert('Subject is required'); return; }
    const result = await addTeacherToDB({
      name: newTeacher.name.trim(),
      subjects: [newTeacher.subject.trim()],
      wing: newTeacher.wing,
      status: 'active',
      phone: newTeacher.phone.trim() || '+91 00000 00000',
    });
    if (!result) return; // DB error already shown
    setNewTeacher({ name: '', subject: '', wing: 'Senior', phone: '+91 ' });
    setShowAddTeacher(false);
    showToast(`✓ ${newTeacher.name} added to faculty`);
    // Realtime subscription will refresh teachers list
  };

  const deleteTeacher = async (teacher) => {
    const firstName = teacher.name.split(' ')[0];
    const orphanCount = Object.values(cells).filter(c => c.tch === firstName).length;
    const msg = orphanCount > 0
      ? `${teacher.name} ko delete karne par ${orphanCount} class assignments unassigned ho jayenge. Sure?`
      : `Delete ${teacher.name}? This action cannot be undone.`;
    if (!confirm(msg)) return;
    await deleteTeacherFromDB(teacher.id);
    setContactTeacher(null);
    showToast(`✗ ${teacher.name} removed`);
  };

  const addRoom = async () => {
    if (!newRoom.name.trim()) { alert('Room name is required'); return; }
    if (newRoom.capacity < 1) { alert('Capacity must be at least 1'); return; }
    const result = await addRoomToDB({
      name: newRoom.name.toUpperCase().trim(),
      wing: newRoom.wing,
      capacity: parseInt(newRoom.capacity),
      floor: newRoom.floor.trim() || '—',
    });
    if (!result) return;
    setNewRoom({ name: '', wing: 'Senior', capacity: 60, floor: 'Ground' });
    setShowAddRoom(false);
    showToast(`✓ Room ${newRoom.name.toUpperCase()} added`);
  };

  const deleteRoom = async (room) => {
    const orphanCount = Object.values(cells).filter(c => c.room === room.name).length;
    const msg = orphanCount > 0
      ? `Room ${room.name} mein ${orphanCount} classes assigned hain. Delete karoge?`
      : `Delete classroom ${room.name}?`;
    if (!confirm(msg)) return;
    await deleteRoomFromDB(room.id);
    showToast(`✗ Room ${room.name} removed`);
  };

  const addBatch = async () => {
    if (!newBatch.name.trim()) { alert('Batch name is required'); return; }
    if (newBatch.strength < 1) { alert('Strength must be at least 1'); return; }
    const result = await addBatchToDB({
      name: newBatch.name.trim(),
      wing: newBatch.wing,
      strength: parseInt(newBatch.strength),
      classTeacher: newBatch.classTeacher.trim() || null,
    });
    if (!result) return;
    setNewBatch({ name: '', wing: 'Senior', strength: 30, classTeacher: '' });
    setShowAddBatch(false);
    showToast(`✓ Batch ${newBatch.name} added`);
  };

  const deleteBatch = async (batch) => {
    const orphanCount = Object.entries(cells).filter(([key]) => key.slice(key.split('-')[0].length + 1) === batch.name).length;
    const msg = orphanCount > 0
      ? `Batch ${batch.name} mein ${orphanCount} classes assigned hain. Delete karoge?`
      : `Delete batch ${batch.name}?`;
    if (!confirm(msg)) return;
    await deleteBatchFromDB(batch.id);
    showToast(`✗ Batch ${batch.name} removed`);
  };

  // EDIT HANDLERS
  const saveEditTeacher = async () => {
    if (!editTeacher.name?.trim()) { alert('Teacher name is required'); return; }
    if (!editTeacher.subjects?.[0]?.trim()) { alert('Subject is required'); return; }
    await updateTeacherInDB(editTeacher.id, {
      name: editTeacher.name.trim(),
      subjects: [editTeacher.subjects[0].trim()],
      wing: editTeacher.wing,
      phone: editTeacher.phone?.trim() || '+91 00000 00000',
    });
    showToast(`✓ ${editTeacher.name} updated`);
    setEditTeacher(null);
    setContactTeacher(null);
  };

  const saveEditRoom = async () => {
    if (!editRoom.name?.trim()) { alert('Room name is required'); return; }
    if (editRoom.capacity < 1) { alert('Capacity must be at least 1'); return; }
    const newName = editRoom.name.toUpperCase().trim();
    await updateRoomInDB(editRoom.id, {
      name: newName,
      wing: editRoom.wing,
      capacity: parseInt(editRoom.capacity),
      floor: editRoom.floor?.trim() || '—',
    });
    showToast(`✓ Room ${newName} updated`);
    setEditRoom(null);
  };

  const saveEditBatch = async () => {
    if (!editBatch.name?.trim()) { alert('Batch name is required'); return; }
    if (editBatch.strength < 1) { alert('Strength must be at least 1'); return; }
    const newName = editBatch.name.trim();
    await updateBatchInDB(editBatch.id, {
      name: newName,
      wing: editBatch.wing,
      strength: parseInt(editBatch.strength),
      classTeacher: editBatch.classTeacher?.trim() || null,
    });
    showToast(`✓ Batch ${newName} updated`);
    setEditBatch(null);
  };

  // ============ TIME SLOTS HANDLERS ============
  // Validate time format: HH:MM
  const isValidTime = (t) => /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(t);

  // Time comparison: returns true if start < end
  const isTimeBefore = (start, end) => {
    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = end.split(':').map(Number);
    return sh * 60 + sm < eh * 60 + em;
  };

  const addSlot = async () => {
    if (!newSlot.label.trim()) { alert('Label is required (e.g., "Period 1" or "Lunch Break")'); return; }
    if (!isValidTime(newSlot.startTime)) { alert('Start time must be in HH:MM format (e.g., 08:00)'); return; }
    if (!isValidTime(newSlot.endTime)) { alert('End time must be in HH:MM format (e.g., 09:00)'); return; }
    if (!isTimeBefore(newSlot.startTime, newSlot.endTime)) { alert('End time must be after start time'); return; }
    // Check for duplicate start time
    if (timeSlots.find(s => s.startTime === newSlot.startTime)) {
      alert(`A slot already starts at ${newSlot.startTime}. Use a different start time.`);
      return;
    }
    const result = await addTimeSlotToDB({
      startTime: newSlot.startTime,
      endTime: newSlot.endTime,
      label: newSlot.label.trim(),
      isBreak: newSlot.isBreak,
    });
    if (!result) return;
    setNewSlot({ startTime: '08:00', endTime: '09:00', label: 'Period', isBreak: false });
    setShowAddSlot(false);
    showToast(`✓ ${newSlot.isBreak ? 'Break' : 'Period'} added: ${newSlot.startTime} - ${newSlot.endTime}`);
  };

  const deleteSlot = async (slot) => {
    const orphanCount = Object.keys(cells).filter(k => k.startsWith(slot.startTime + '-')).length;
    const msg = orphanCount > 0
      ? `Slot ${slot.startTime}-${slot.endTime} (${slot.label}) mein ${orphanCount} classes assigned hain. Delete karne par woh cells orphan ho jayenge. Sure?`
      : `Delete time slot "${slot.label}" (${slot.startTime}-${slot.endTime})?`;
    if (!confirm(msg)) return;
    await deleteTimeSlotFromDB(slot.id);
    showToast(`✗ Slot ${slot.label} removed`);
  };

  const saveEditSlot = async () => {
    if (!editSlot.label?.trim()) { alert('Label is required'); return; }
    if (!isValidTime(editSlot.startTime)) { alert('Start time must be in HH:MM format'); return; }
    if (!isValidTime(editSlot.endTime)) { alert('End time must be in HH:MM format'); return; }
    if (!isTimeBefore(editSlot.startTime, editSlot.endTime)) { alert('End time must be after start time'); return; }
    // Check duplicate startTime against OTHER slots
    if (timeSlots.find(s => s.id !== editSlot.id && s.startTime === editSlot.startTime)) {
      alert(`Another slot already starts at ${editSlot.startTime}. Use a different start time.`);
      return;
    }
    await updateTimeSlotInDB(editSlot.id, {
      startTime: editSlot.startTime,
      endTime: editSlot.endTime,
      label: editSlot.label.trim(),
      isBreak: editSlot.isBreak,
    });
    showToast(`✓ Slot updated: ${editSlot.label}`);
    setEditSlot(null);
  };

  // Counts
  const seniorCount = teachers.filter(t => t.wing === 'Senior' || t.wing === 'Both').length;
  const juniorCount = teachers.filter(t => t.wing === 'Junior' || t.wing === 'Both').length;
  const totalCapacity = classrooms.reduce((sum, r) => sum + r.capacity, 0);
  const totalStudents = batches.reduce((sum, b) => sum + b.strength, 0);

  return (
    <div className="space-y-6">
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 border border-emerald-700/50 bg-emerald-500/10 backdrop-blur px-4 py-3 text-emerald-200 text-xs max-w-md shadow-2xl flex items-center gap-2 animate-in fade-in slide-in-from-top">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span className="flex-1">{toast}</span>
        </div>
      )}

      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-stone-800 pb-4">
        <div>
          <div className="text-[10px] uppercase tracking-[0.25em] text-amber-500/70 font-mono mb-1">Module 03 · {activeTab === 'teachers' ? 'Faculty' : activeTab === 'classrooms' ? 'Classrooms' : 'Batches'}</div>
          <h1 className="text-3xl md:text-4xl font-light tracking-tight text-stone-50" style={{fontFamily: 'Fraunces, serif'}}>
            {activeTab === 'teachers' ? <>Teacher <span className="italic text-amber-300/90">roster</span></> : activeTab === 'classrooms' ? <>Classroom <span className="italic text-amber-300/90">inventory</span></> : <>Batch <span className="italic text-amber-300/90">groups</span></>}
          </h1>
          <p className="text-stone-500 text-sm mt-1">
            {activeTab === 'teachers' ? <>{teachers.length} active · {seniorCount} Senior · {juniorCount} Junior · <span className="text-amber-400/70">tap any to call</span></> : activeTab === 'classrooms' ? <>{classrooms.length} rooms · total capacity {totalCapacity} students</> : <>{batches.length} batches · {totalStudents} total students · class teachers assigned</>}
          </p>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          {activeTab === 'teachers' && (
            <>
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-500" />
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..." className="bg-stone-950 border border-stone-800 pl-7 pr-3 py-1.5 text-xs text-stone-200 placeholder-stone-600 focus:border-amber-600/40 focus:outline-none w-44" />
              </div>
              {['All','Senior','Junior'].map(w => (
                <button key={w} onClick={() => setWingFilter(w)} className={`px-3 py-1.5 text-[10px] uppercase tracking-wider font-mono border transition-colors ${wingFilter === w ? 'border-amber-600/50 bg-amber-500/10 text-amber-300' : 'border-stone-800 text-stone-500 hover:text-stone-300'}`}>{w}</button>
              ))}
            </>
          )}
        </div>
      </div>

      {/* TAB TOGGLE — Teachers / Classrooms / Batches / Time Slots */}
      <div className="flex gap-2 flex-wrap items-center">
        <button onClick={() => setActiveTab('teachers')} className={`px-4 py-2 text-[10px] uppercase tracking-wider font-mono border flex items-center gap-2 transition-colors ${activeTab === 'teachers' ? 'border-amber-600/50 bg-amber-500/10 text-amber-300' : 'border-stone-800 text-stone-500 hover:text-stone-300 hover:border-stone-700'}`}>
          <Users className="w-3 h-3" /> Teachers ({teachers.length})
        </button>
        <button onClick={() => setActiveTab('classrooms')} className={`px-4 py-2 text-[10px] uppercase tracking-wider font-mono border flex items-center gap-2 transition-colors ${activeTab === 'classrooms' ? 'border-amber-600/50 bg-amber-500/10 text-amber-300' : 'border-stone-800 text-stone-500 hover:text-stone-300 hover:border-stone-700'}`}>
          <MapPin className="w-3 h-3" /> Classrooms ({classrooms.length})
        </button>
        <button onClick={() => setActiveTab('batches')} className={`px-4 py-2 text-[10px] uppercase tracking-wider font-mono border flex items-center gap-2 transition-colors ${activeTab === 'batches' ? 'border-amber-600/50 bg-amber-500/10 text-amber-300' : 'border-stone-800 text-stone-500 hover:text-stone-300 hover:border-stone-700'}`}>
          <Layers className="w-3 h-3" /> Batches ({batches.length})
        </button>
        <button onClick={() => setActiveTab('slots')} className={`px-4 py-2 text-[10px] uppercase tracking-wider font-mono border flex items-center gap-2 transition-colors ${activeTab === 'slots' ? 'border-amber-600/50 bg-amber-500/10 text-amber-300' : 'border-stone-800 text-stone-500 hover:text-stone-300 hover:border-stone-700'}`}>
          <Calendar className="w-3 h-3" /> Time Slots ({timeSlots.length})
        </button>
        <button onClick={() => activeTab === 'teachers' ? setShowAddTeacher(true) : activeTab === 'classrooms' ? setShowAddRoom(true) : activeTab === 'batches' ? setShowAddBatch(true) : setShowAddSlot(true)} className="ml-auto px-4 py-2 text-[10px] uppercase tracking-wider font-mono border border-emerald-600/50 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 flex items-center gap-2 transition-colors">
          + Add {activeTab === 'teachers' ? 'Teacher' : activeTab === 'classrooms' ? 'Classroom' : activeTab === 'batches' ? 'Batch' : 'Time Slot'}
        </button>
      </div>

      {activeTab === 'teachers' && (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered.map(t => {
          const pct = Math.min(100, (t.hours / 10) * 100);
          const tone = t.hours >= 8 ? 'amber' : t.hours >= 5 ? 'stone' : 'sky';
          return (
            <div key={t.id} onClick={() => setContactTeacher(t)} className="border border-stone-800 bg-stone-950/40 hover:bg-stone-900/60 hover:border-amber-600/40 p-5 transition-all cursor-pointer relative group">
              {t.status === 'leave' && <div className="absolute top-3 right-3"><Pill variant="warning">On Leave</Pill></div>}
              {t.status === 'oncall' && <div className="absolute top-3 right-3"><Pill variant="info">On-Call</Pill></div>}
              <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                {t.status === 'active' && <Phone className="w-3.5 h-3.5 text-amber-400" strokeWidth={2} />}
                <button onClick={(e) => { e.stopPropagation(); setEditTeacher({...t, subjects: [...(t.subjects || [''])]}); }} className="text-sky-400 hover:text-sky-300 p-0.5" title="Edit teacher">
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button onClick={(e) => { e.stopPropagation(); deleteTeacher(t); }} className="text-red-400 hover:text-red-300 p-0.5" title="Delete teacher">
                  <XCircle className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="flex items-start gap-3 mb-4">
                {photos[t.id] ? (
                  <img src={photos[t.id]} alt={t.name} className="w-10 h-10 object-cover border border-stone-700 group-hover:border-amber-600/50 transition-colors shrink-0" />
                ) : (
                  <div className="w-10 h-10 border border-stone-700 bg-stone-900 flex items-center justify-center text-amber-300/80 font-mono text-sm shrink-0 group-hover:border-amber-600/50 group-hover:bg-amber-500/5 transition-colors" style={{fontFamily: 'Fraunces, serif'}}>
                    {t.name.split(' ').map(n => n[0]).slice(0,2).join('')}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-stone-100 text-sm truncate group-hover:text-amber-200 transition-colors">{t.name}</div>
                  <div className="text-stone-500 text-[10px] uppercase tracking-wider font-mono mt-0.5 truncate">{t.subjects.join(' · ')}</div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 mb-3">
                <div className="border-l border-stone-800 pl-2">
                  <div className="text-[9px] uppercase tracking-wider text-stone-600 font-mono">Hours</div>
                  <div className={`text-xl font-light ${tone === 'amber' ? 'text-amber-300' : 'text-stone-100'}`} style={{fontFamily: 'Fraunces, serif'}}>{t.hours.toFixed(1)}</div>
                </div>
                <div className="border-l border-stone-800 pl-2">
                  <div className="text-[9px] uppercase tracking-wider text-stone-600 font-mono">Slots</div>
                  <div className="text-xl font-light text-stone-100" style={{fontFamily: 'Fraunces, serif'}}>{t.slots}</div>
                </div>
                <div className="border-l border-stone-800 pl-2">
                  <div className="text-[9px] uppercase tracking-wider text-stone-600 font-mono">Wing</div>
                  <div className="text-xs text-stone-100 mt-1.5">{t.wing}</div>
                </div>
              </div>
              <div className="h-0.5 bg-stone-900 overflow-hidden">
                <div className={`h-full ${tone === 'amber' ? 'bg-amber-500/70' : tone === 'sky' ? 'bg-sky-500/40' : 'bg-stone-500'}`} style={{width: `${pct}%`}} />
              </div>
            </div>
          );
        })}
      </div>
      )}

      {/* CLASSROOMS TAB */}
      {activeTab === 'classrooms' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {classrooms.map(r => {
            const wingColors = {
              'Senior': 'border-amber-700/40 text-amber-300',
              'Junior': 'border-sky-700/40 text-sky-300',
              'Lab': 'border-emerald-700/40 text-emerald-300',
              'Online': 'border-purple-700/40 text-purple-300',
              'Outdoor': 'border-orange-700/40 text-orange-300',
            };
            const cls = wingColors[r.wing] || 'border-stone-700 text-stone-300';
            return (
              <div key={r.id} className={`border ${cls.split(' ')[0]} bg-stone-950/40 hover:bg-stone-900/60 p-5 transition-all relative group`}>
                <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                  <button onClick={() => setEditRoom({...r})} className="text-sky-400 hover:text-sky-300" title="Edit classroom">
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button onClick={() => deleteRoom(r)} className="text-red-400 hover:text-red-300" title="Delete classroom">
                    <XCircle className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex items-start gap-3 mb-4">
                  <div className={`w-10 h-10 border ${cls.split(' ')[0]} bg-stone-900 flex items-center justify-center shrink-0`}>
                    <MapPin className={`w-4 h-4 ${cls.split(' ')[1]}`} strokeWidth={2} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className={`text-base ${cls.split(' ')[1]} font-mono tracking-wider`} style={{fontFamily: 'Fraunces, serif'}}>{r.name}</div>
                    <div className="text-stone-500 text-[10px] uppercase tracking-wider font-mono mt-0.5">{r.wing} Wing · {r.floor} floor</div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 pt-3 border-t border-stone-800">
                  <div>
                    <div className="text-[9px] uppercase tracking-wider text-stone-600 font-mono mb-0.5">Capacity</div>
                    <div className="flex items-baseline gap-1">
                      <Users className="w-3 h-3 text-stone-500" />
                      <span className={`text-2xl font-light ${cls.split(' ')[1]}`} style={{fontFamily: 'Fraunces, serif'}}>{r.capacity}</span>
                      <span className="text-[10px] text-stone-500">students</span>
                    </div>
                  </div>
                  <div>
                    <div className="text-[9px] uppercase tracking-wider text-stone-600 font-mono mb-0.5">Type</div>
                    <div className="text-xs text-stone-300 mt-1">{r.wing}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* BATCHES TAB */}
      {activeTab === 'batches' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {batches.map(b => {
            const wingColors = {
              'Senior': 'border-amber-700/40 text-amber-300',
              'Junior': 'border-sky-700/40 text-sky-300',
            };
            const cls = wingColors[b.wing] || 'border-stone-700 text-stone-300';
            const classTeacherFull = teachers.find(t => t.name.split(' ')[0] === b.classTeacher)?.name || (b.classTeacher ? `${b.classTeacher} Sir` : 'Unassigned');
            return (
              <div key={b.id} className={`border ${cls.split(' ')[0]} bg-stone-950/40 hover:bg-stone-900/60 p-5 transition-all relative group`}>
                <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                  <button onClick={() => setEditBatch({...b})} className="text-sky-400 hover:text-sky-300" title="Edit batch">
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button onClick={() => deleteBatch(b)} className="text-red-400 hover:text-red-300" title="Delete batch">
                    <XCircle className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex items-start gap-3 mb-4">
                  <div className={`w-10 h-10 border ${cls.split(' ')[0]} bg-stone-900 flex items-center justify-center shrink-0`}>
                    <Layers className={`w-4 h-4 ${cls.split(' ')[1]}`} strokeWidth={2} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className={`text-lg ${cls.split(' ')[1]}`} style={{fontFamily: 'Fraunces, serif'}}>{b.name}</div>
                    <div className="text-stone-500 text-[10px] uppercase tracking-wider font-mono mt-0.5">{b.wing} Wing</div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 pt-3 border-t border-stone-800 mb-3">
                  <div>
                    <div className="text-[9px] uppercase tracking-wider text-stone-600 font-mono mb-0.5">Students</div>
                    <div className="flex items-baseline gap-1">
                      <Users className="w-3 h-3 text-stone-500" />
                      <span className={`text-2xl font-light ${cls.split(' ')[1]}`} style={{fontFamily: 'Fraunces, serif'}}>{b.strength}</span>
                    </div>
                  </div>
                  <div>
                    <div className="text-[9px] uppercase tracking-wider text-stone-600 font-mono mb-0.5">Wing</div>
                    <div className="text-xs text-stone-300 mt-1">{b.wing}</div>
                  </div>
                </div>
                <div className="pt-2 border-t border-stone-800/60">
                  <div className="text-[9px] uppercase tracking-wider text-stone-600 font-mono mb-0.5">Class Teacher</div>
                  <div className="text-xs text-stone-200 truncate">{classTeacherFull}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ============ TIME SLOTS TAB ============ */}
      {activeTab === 'slots' && (
        <div className="space-y-3">
          <div className="border border-stone-800 bg-stone-950/40 p-4 mb-2">
            <div className="text-[10px] uppercase tracking-[0.25em] text-stone-500 font-mono mb-2 flex items-center gap-2">
              <AlertCircle className="w-3 h-3 text-amber-400" /> About Time Slots
            </div>
            <div className="text-stone-300 text-xs leading-relaxed mb-2">
              Yahaan se aap timetable ke <span className="text-amber-300">periods aur breaks</span> manage kar sakte ho:
            </div>
            <ul className="text-stone-400 text-[11px] space-y-1 ml-3 list-disc">
              <li><span className="text-stone-200">Period add karo</span> — class slot (e.g., 08:00 - 09:00 Period 1)</li>
              <li><span className="text-stone-200">Lunch break</span> — toggle "Is Break?" — Timetable mein full-width amber strip dikhega, classes assign nahi hongi</li>
              <li><span className="text-stone-200">Double period</span> — long duration set karo (e.g., 08:00 - 10:00 = 2 hour)</li>
              <li><span className="text-stone-200">Custom timing</span> — institute timings ke hisaab se time set karo</li>
            </ul>
          </div>

          {timeSlots.length === 0 ? (
            <div className="border border-stone-800 bg-stone-950/40 p-8 text-center">
              <Calendar className="w-10 h-10 text-stone-700 mx-auto mb-3" />
              <div className="text-stone-300 text-sm" style={{fontFamily: 'Fraunces, serif'}}>No time slots yet</div>
              <div className="text-stone-500 text-xs mt-1">Add karke timetable structure setup karo</div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {timeSlots.map(slot => (
                <div key={slot.id} className={`border p-4 group relative transition-all ${slot.isBreak ? 'border-amber-700/40 bg-amber-500/5 hover:bg-amber-500/10' : 'border-stone-800 bg-stone-950/40 hover:border-stone-700'}`}>
                  <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                    <button onClick={() => setEditSlot({...slot})} className="text-sky-400 hover:text-sky-300" title="Edit slot">
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button onClick={() => deleteSlot(slot)} className="text-red-400 hover:text-red-300" title="Delete slot">
                      <XCircle className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="flex items-center gap-2 mb-2">
                    {slot.isBreak ? (
                      <Coffee className="w-4 h-4 text-amber-400" strokeWidth={2} />
                    ) : (
                      <Calendar className="w-4 h-4 text-stone-400" strokeWidth={2} />
                    )}
                    <div className="flex-1">
                      <div className={`text-sm ${slot.isBreak ? 'text-amber-300' : 'text-stone-100'}`} style={{fontFamily: 'Fraunces, serif'}}>
                        {slot.label}
                      </div>
                    </div>
                    {slot.isBreak && (
                      <span className="text-[9px] uppercase tracking-wider font-mono text-amber-400/80 bg-amber-500/10 px-2 py-0.5 border border-amber-700/40">Break</span>
                    )}
                  </div>
                  <div className="font-mono text-stone-300 text-base">
                    {slot.startTime} <span className="text-stone-600 mx-1">→</span> {slot.endTime}
                  </div>
                  <div className="text-[10px] text-stone-500 mt-1">
                    Duration: {(() => {
                      const [sh, sm] = slot.startTime.split(':').map(Number);
                      const [eh, em] = slot.endTime.split(':').map(Number);
                      const mins = (eh * 60 + em) - (sh * 60 + sm);
                      return mins >= 60 ? `${Math.floor(mins / 60)} hr ${mins % 60 ? `${mins % 60} min` : ''}`.trim() : `${mins} min`;
                    })()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ADD TIME SLOT MODAL */}
      {showAddSlot && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur z-50 flex items-center justify-center p-4" onClick={() => setShowAddSlot(false)}>
          <div className="w-full max-w-md bg-stone-950 border border-amber-700/40 p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <div>
                <div className="text-[10px] uppercase tracking-[0.25em] text-amber-500/70 font-mono">New Time Slot</div>
                <h3 className="text-xl text-stone-100 font-light mt-1" style={{fontFamily: 'Fraunces, serif'}}>Add period or break</h3>
              </div>
              <button onClick={() => setShowAddSlot(false)} className="text-stone-500 hover:text-stone-300 shrink-0">
                <XCircle className="w-5 h-5" />
              </button>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-stone-500 font-mono mb-1.5">Label / Name</div>
              <input value={newSlot.label} onChange={e => setNewSlot({...newSlot, label: e.target.value})} placeholder={newSlot.isBreak ? 'e.g., Lunch Break' : 'e.g., Period 1'} className="w-full bg-stone-900 border border-stone-800 px-3 py-2.5 text-stone-200 text-sm focus:border-amber-600/40 focus:outline-none" autoFocus />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-stone-500 font-mono mb-1.5">Start Time</div>
                <input type="time" value={newSlot.startTime} onChange={e => setNewSlot({...newSlot, startTime: e.target.value})} className="w-full bg-stone-900 border border-stone-800 px-3 py-2.5 text-stone-200 text-sm font-mono focus:border-amber-600/40 focus:outline-none [color-scheme:dark]" />
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-stone-500 font-mono mb-1.5">End Time</div>
                <input type="time" value={newSlot.endTime} onChange={e => setNewSlot({...newSlot, endTime: e.target.value})} className="w-full bg-stone-900 border border-stone-800 px-3 py-2.5 text-stone-200 text-sm font-mono focus:border-amber-600/40 focus:outline-none [color-scheme:dark]" />
              </div>
            </div>
            <div>
              <label className="flex items-center gap-3 cursor-pointer p-3 border border-stone-800 hover:border-amber-600/40 transition-colors">
                <input type="checkbox" checked={newSlot.isBreak} onChange={e => setNewSlot({...newSlot, isBreak: e.target.checked, label: e.target.checked && newSlot.label === 'Period' ? 'Lunch Break' : newSlot.label})} className="w-4 h-4 accent-amber-500" />
                <div className="flex-1">
                  <div className="text-stone-200 text-sm flex items-center gap-2">
                    <Coffee className="w-3.5 h-3.5 text-amber-400" /> Is this a Break?
                  </div>
                  <div className="text-stone-500 text-[10px] mt-0.5">Lunch, tea break, prayer time, etc. — no classes assignable</div>
                </div>
              </label>
            </div>
            <div className="flex gap-2 pt-2">
              <button onClick={() => setShowAddSlot(false)} className="px-3 py-2 text-[10px] uppercase tracking-wider font-mono border border-stone-700 text-stone-400">Cancel</button>
              <button onClick={addSlot} className="ml-auto px-4 py-2 text-[10px] uppercase tracking-wider font-mono border border-emerald-600/50 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 flex items-center gap-2">
                + Add Slot
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EDIT TIME SLOT MODAL */}
      {editSlot && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur z-50 flex items-center justify-center p-4" onClick={() => setEditSlot(null)}>
          <div className="w-full max-w-md bg-stone-950 border border-sky-700/40 p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <div>
                <div className="text-[10px] uppercase tracking-[0.25em] text-sky-400/70 font-mono">Edit Time Slot</div>
                <h3 className="text-xl text-stone-100 font-light mt-1" style={{fontFamily: 'Fraunces, serif'}}>Update slot details</h3>
              </div>
              <button onClick={() => setEditSlot(null)} className="text-stone-500 hover:text-stone-300 shrink-0">
                <XCircle className="w-5 h-5" />
              </button>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-stone-500 font-mono mb-1.5">Label / Name</div>
              <input value={editSlot.label || ''} onChange={e => setEditSlot({...editSlot, label: e.target.value})} className="w-full bg-stone-900 border border-stone-800 px-3 py-2.5 text-stone-200 text-sm focus:border-sky-600/40 focus:outline-none" autoFocus />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-stone-500 font-mono mb-1.5">Start Time</div>
                <input type="time" value={editSlot.startTime || ''} onChange={e => setEditSlot({...editSlot, startTime: e.target.value})} className="w-full bg-stone-900 border border-stone-800 px-3 py-2.5 text-stone-200 text-sm font-mono focus:border-sky-600/40 focus:outline-none [color-scheme:dark]" />
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-stone-500 font-mono mb-1.5">End Time</div>
                <input type="time" value={editSlot.endTime || ''} onChange={e => setEditSlot({...editSlot, endTime: e.target.value})} className="w-full bg-stone-900 border border-stone-800 px-3 py-2.5 text-stone-200 text-sm font-mono focus:border-sky-600/40 focus:outline-none [color-scheme:dark]" />
              </div>
            </div>
            <div>
              <label className="flex items-center gap-3 cursor-pointer p-3 border border-stone-800 hover:border-sky-600/40 transition-colors">
                <input type="checkbox" checked={editSlot.isBreak || false} onChange={e => setEditSlot({...editSlot, isBreak: e.target.checked})} className="w-4 h-4 accent-sky-500" />
                <div className="flex-1">
                  <div className="text-stone-200 text-sm flex items-center gap-2">
                    <Coffee className="w-3.5 h-3.5 text-amber-400" /> Is this a Break?
                  </div>
                  <div className="text-stone-500 text-[10px] mt-0.5">Lunch, tea break, prayer time, etc. — no classes assignable</div>
                </div>
              </label>
            </div>
            <div className="flex gap-2 pt-2">
              <button onClick={() => setEditSlot(null)} className="px-3 py-2 text-[10px] uppercase tracking-wider font-mono border border-stone-700 text-stone-400">Cancel</button>
              <button onClick={saveEditSlot} className="ml-auto px-4 py-2 text-[10px] uppercase tracking-wider font-mono border border-sky-600/50 bg-sky-500/10 text-sky-300 hover:bg-sky-500/20 flex items-center gap-2">
                <CheckCircle2 className="w-3 h-3" /> Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ADD BATCH MODAL */}
      {showAddBatch && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur z-50 flex items-center justify-center p-4" onClick={() => setShowAddBatch(false)}>
          <div className="w-full max-w-md bg-stone-950 border border-amber-700/40 p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <div>
                <div className="text-[10px] uppercase tracking-[0.25em] text-amber-500/70 font-mono">New Batch</div>
                <h3 className="text-xl text-stone-100 font-light mt-1" style={{fontFamily: 'Fraunces, serif'}}>Add a batch</h3>
                <div className="text-stone-500 text-[11px] mt-1">Batch add karne ke baad Timetable mein naya column dikhega — Manager classes assign kar sakta hai</div>
              </div>
              <button onClick={() => setShowAddBatch(false)} className="text-stone-500 hover:text-stone-300 shrink-0">
                <XCircle className="w-5 h-5" />
              </button>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-stone-500 font-mono mb-1.5">Batch Name</div>
              <input value={newBatch.name} onChange={e => setNewBatch({...newBatch, name: e.target.value})} placeholder="e.g. 11th D, NDA 25 Apr, Class 9" className="w-full bg-stone-900 border border-stone-800 px-3 py-2.5 text-stone-200 text-sm focus:border-amber-600/40 focus:outline-none" autoFocus />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-stone-500 font-mono mb-1.5">Wing</div>
              <div className="grid grid-cols-2 gap-2">
                {['Senior', 'Junior'].map(w => (
                  <button key={w} onClick={() => setNewBatch({...newBatch, wing: w})} className={`px-3 py-2 text-xs border transition-colors ${newBatch.wing === w ? 'border-amber-600/50 bg-amber-500/10 text-amber-300' : 'border-stone-800 text-stone-400 hover:border-stone-700'}`}>{w}</button>
                ))}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-stone-500 font-mono mb-1.5 flex items-center gap-2">
                <Users className="w-3 h-3" /> Student Strength
              </div>
              <input type="number" min="1" max="500" value={newBatch.strength} onChange={e => setNewBatch({...newBatch, strength: e.target.value})} placeholder="e.g. 45" className="w-full bg-stone-900 border border-stone-800 px-3 py-2.5 text-stone-200 text-lg font-mono focus:border-amber-600/40 focus:outline-none" />
              <div className="text-[10px] text-stone-500 mt-1 italic">Class 9 mein 120 students aane wale hain — daal do 120</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-stone-500 font-mono mb-1.5">Class Teacher (optional)</div>
              <select value={newBatch.classTeacher} onChange={e => setNewBatch({...newBatch, classTeacher: e.target.value})} className="w-full bg-stone-900 border border-stone-800 px-3 py-2.5 text-stone-200 text-sm focus:border-amber-600/40 focus:outline-none">
                <option value="">— No class teacher —</option>
                {teachers.map(t => {
                  const first = t.name.split(' ')[0];
                  return <option key={t.id} value={first}>{t.name} ({t.subjects?.[0] || '—'})</option>;
                })}
              </select>
            </div>
            <div className="flex gap-2 pt-2">
              <button onClick={() => setShowAddBatch(false)} className="px-3 py-2 text-[10px] uppercase tracking-wider font-mono border border-stone-700 text-stone-400">Cancel</button>
              <button onClick={addBatch} className="ml-auto px-4 py-2 text-[10px] uppercase tracking-wider font-mono border border-emerald-600/50 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 flex items-center gap-2">
                <CheckCircle2 className="w-3 h-3" /> Add Batch
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ADD TEACHER MODAL */}
      {showAddTeacher && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur z-50 flex items-center justify-center p-4" onClick={() => setShowAddTeacher(false)}>
          <div className="w-full max-w-md bg-stone-950 border border-amber-700/40 p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <div>
                <div className="text-[10px] uppercase tracking-[0.25em] text-amber-500/70 font-mono">New Faculty</div>
                <h3 className="text-xl text-stone-100 font-light mt-1" style={{fontFamily: 'Fraunces, serif'}}>Add a teacher</h3>
              </div>
              <button onClick={() => setShowAddTeacher(false)} className="text-stone-500 hover:text-stone-300">
                <XCircle className="w-5 h-5" />
              </button>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-stone-500 font-mono mb-1.5">Full Name</div>
              <input value={newTeacher.name} onChange={e => setNewTeacher({...newTeacher, name: e.target.value})} placeholder="e.g. Rajesh Kumar Sir" className="w-full bg-stone-900 border border-stone-800 px-3 py-2.5 text-stone-200 text-sm focus:border-amber-600/40 focus:outline-none" autoFocus />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-stone-500 font-mono mb-1.5">Primary Subject</div>
              <input value={newTeacher.subject} onChange={e => setNewTeacher({...newTeacher, subject: e.target.value})} placeholder="e.g. NDA Mathematics" className="w-full bg-stone-900 border border-stone-800 px-3 py-2.5 text-stone-200 text-sm focus:border-amber-600/40 focus:outline-none" />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-stone-500 font-mono mb-1.5">Wing</div>
              <div className="grid grid-cols-3 gap-2">
                {['Senior', 'Junior', 'Both'].map(w => (
                  <button key={w} onClick={() => setNewTeacher({...newTeacher, wing: w})} className={`px-3 py-2 text-xs border transition-colors ${newTeacher.wing === w ? 'border-amber-600/50 bg-amber-500/10 text-amber-300' : 'border-stone-800 text-stone-400 hover:border-stone-700'}`}>{w}</button>
                ))}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-stone-500 font-mono mb-1.5">Mobile Number</div>
              <input value={newTeacher.phone} onChange={e => setNewTeacher({...newTeacher, phone: e.target.value})} placeholder="+91 98765 43210" className="w-full bg-stone-900 border border-stone-800 px-3 py-2.5 text-stone-200 text-sm font-mono focus:border-amber-600/40 focus:outline-none" />
            </div>
            <div className="flex gap-2 pt-2">
              <button onClick={() => setShowAddTeacher(false)} className="px-3 py-2 text-[10px] uppercase tracking-wider font-mono border border-stone-700 text-stone-400">Cancel</button>
              <button onClick={addTeacher} className="ml-auto px-4 py-2 text-[10px] uppercase tracking-wider font-mono border border-emerald-600/50 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 flex items-center gap-2">
                <CheckCircle2 className="w-3 h-3" /> Add to Faculty
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ADD CLASSROOM MODAL */}
      {showAddRoom && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur z-50 flex items-center justify-center p-4" onClick={() => setShowAddRoom(false)}>
          <div className="w-full max-w-md bg-stone-950 border border-amber-700/40 p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <div>
                <div className="text-[10px] uppercase tracking-[0.25em] text-amber-500/70 font-mono">New Classroom</div>
                <h3 className="text-xl text-stone-100 font-light mt-1" style={{fontFamily: 'Fraunces, serif'}}>Add a classroom</h3>
              </div>
              <button onClick={() => setShowAddRoom(false)} className="text-stone-500 hover:text-stone-300">
                <XCircle className="w-5 h-5" />
              </button>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-stone-500 font-mono mb-1.5">Room Name / Code</div>
              <input value={newRoom.name} onChange={e => setNewRoom({...newRoom, name: e.target.value.toUpperCase()})} placeholder="e.g. S-301 or LAB-BIO" className="w-full bg-stone-900 border border-stone-800 px-3 py-2.5 text-stone-200 text-sm font-mono focus:border-amber-600/40 focus:outline-none" autoFocus />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-stone-500 font-mono mb-1.5">Wing / Type</div>
              <div className="grid grid-cols-5 gap-1.5">
                {['Senior', 'Junior', 'Lab', 'Online', 'Outdoor'].map(w => (
                  <button key={w} onClick={() => setNewRoom({...newRoom, wing: w})} className={`px-2 py-2 text-[10px] border transition-colors ${newRoom.wing === w ? 'border-amber-600/50 bg-amber-500/10 text-amber-300' : 'border-stone-800 text-stone-400 hover:border-stone-700'}`}>{w}</button>
                ))}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-stone-500 font-mono mb-1.5 flex items-center gap-2">
                <Users className="w-3 h-3" /> Student Capacity
              </div>
              <input type="number" min="1" max="500" value={newRoom.capacity} onChange={e => setNewRoom({...newRoom, capacity: e.target.value})} placeholder="e.g. 120" className="w-full bg-stone-900 border border-stone-800 px-3 py-2.5 text-stone-200 text-lg font-mono focus:border-amber-600/40 focus:outline-none" />
              <div className="text-[10px] text-stone-500 mt-1 italic">e.g. Class 9 ke 120 students aane wale hain — daal do 120 capacity</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-stone-500 font-mono mb-1.5">Floor</div>
              <div className="grid grid-cols-4 gap-2">
                {['Ground', '1st', '2nd', '3rd'].map(f => (
                  <button key={f} onClick={() => setNewRoom({...newRoom, floor: f})} className={`px-2 py-2 text-xs border transition-colors ${newRoom.floor === f ? 'border-amber-600/50 bg-amber-500/10 text-amber-300' : 'border-stone-800 text-stone-400 hover:border-stone-700'}`}>{f}</button>
                ))}
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <button onClick={() => setShowAddRoom(false)} className="px-3 py-2 text-[10px] uppercase tracking-wider font-mono border border-stone-700 text-stone-400">Cancel</button>
              <button onClick={addRoom} className="ml-auto px-4 py-2 text-[10px] uppercase tracking-wider font-mono border border-emerald-600/50 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 flex items-center gap-2">
                <CheckCircle2 className="w-3 h-3" /> Add Classroom
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EDIT TEACHER MODAL */}
      {editTeacher && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur z-50 flex items-center justify-center p-4" onClick={() => setEditTeacher(null)}>
          <div className="w-full max-w-md bg-stone-950 border border-sky-700/40 p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <div>
                <div className="text-[10px] uppercase tracking-[0.25em] text-sky-400/70 font-mono">Edit Faculty</div>
                <h3 className="text-xl text-stone-100 font-light mt-1" style={{fontFamily: 'Fraunces, serif'}}>Update teacher details</h3>
                <div className="text-stone-500 text-[11px] mt-1">Editing: <span className="text-sky-300">{teachers.find(t => t.id === editTeacher.id)?.name}</span></div>
              </div>
              <button onClick={() => setEditTeacher(null)} className="text-stone-500 hover:text-stone-300 shrink-0">
                <XCircle className="w-5 h-5" />
              </button>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-stone-500 font-mono mb-1.5">Full Name</div>
              <input value={editTeacher.name || ''} onChange={e => setEditTeacher({...editTeacher, name: e.target.value})} className="w-full bg-stone-900 border border-stone-800 px-3 py-2.5 text-stone-200 text-sm focus:border-sky-600/40 focus:outline-none" autoFocus />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-stone-500 font-mono mb-1.5">Primary Subject</div>
              <input value={editTeacher.subjects?.[0] || ''} onChange={e => setEditTeacher({...editTeacher, subjects: [e.target.value]})} className="w-full bg-stone-900 border border-stone-800 px-3 py-2.5 text-stone-200 text-sm focus:border-sky-600/40 focus:outline-none" />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-stone-500 font-mono mb-1.5">Wing</div>
              <div className="grid grid-cols-3 gap-2">
                {['Senior', 'Junior', 'Both'].map(w => (
                  <button key={w} onClick={() => setEditTeacher({...editTeacher, wing: w})} className={`px-3 py-2 text-xs border transition-colors ${editTeacher.wing === w ? 'border-sky-600/50 bg-sky-500/10 text-sky-300' : 'border-stone-800 text-stone-400 hover:border-stone-700'}`}>{w}</button>
                ))}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-stone-500 font-mono mb-1.5">Mobile Number</div>
              <input value={editTeacher.phone || ''} onChange={e => setEditTeacher({...editTeacher, phone: e.target.value})} className="w-full bg-stone-900 border border-stone-800 px-3 py-2.5 text-stone-200 text-sm font-mono focus:border-sky-600/40 focus:outline-none" />
              <div className="text-[10px] text-stone-500 mt-1 italic">Yeh number teacher login ke liye use hota hai</div>
            </div>
            <div className="flex gap-2 pt-2">
              <button onClick={() => setEditTeacher(null)} className="px-3 py-2 text-[10px] uppercase tracking-wider font-mono border border-stone-700 text-stone-400">Cancel</button>
              <button onClick={saveEditTeacher} className="ml-auto px-4 py-2 text-[10px] uppercase tracking-wider font-mono border border-sky-600/50 bg-sky-500/10 text-sky-300 hover:bg-sky-500/20 flex items-center gap-2">
                <CheckCircle2 className="w-3 h-3" /> Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EDIT CLASSROOM MODAL */}
      {editRoom && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur z-50 flex items-center justify-center p-4" onClick={() => setEditRoom(null)}>
          <div className="w-full max-w-md bg-stone-950 border border-sky-700/40 p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <div>
                <div className="text-[10px] uppercase tracking-[0.25em] text-sky-400/70 font-mono">Edit Classroom</div>
                <h3 className="text-xl text-stone-100 font-light mt-1" style={{fontFamily: 'Fraunces, serif'}}>Update room details</h3>
                <div className="text-stone-500 text-[11px] mt-1">Editing: <span className="text-sky-300">{classrooms.find(r => r.id === editRoom.id)?.name}</span></div>
              </div>
              <button onClick={() => setEditRoom(null)} className="text-stone-500 hover:text-stone-300 shrink-0">
                <XCircle className="w-5 h-5" />
              </button>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-stone-500 font-mono mb-1.5">Room Name / Code</div>
              <input value={editRoom.name || ''} onChange={e => setEditRoom({...editRoom, name: e.target.value.toUpperCase()})} className="w-full bg-stone-900 border border-stone-800 px-3 py-2.5 text-stone-200 text-sm font-mono focus:border-sky-600/40 focus:outline-none" autoFocus />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-stone-500 font-mono mb-1.5">Wing / Type</div>
              <div className="grid grid-cols-5 gap-1.5">
                {['Senior', 'Junior', 'Lab', 'Online', 'Outdoor'].map(w => (
                  <button key={w} onClick={() => setEditRoom({...editRoom, wing: w})} className={`px-2 py-2 text-[10px] border transition-colors ${editRoom.wing === w ? 'border-sky-600/50 bg-sky-500/10 text-sky-300' : 'border-stone-800 text-stone-400 hover:border-stone-700'}`}>{w}</button>
                ))}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-stone-500 font-mono mb-1.5 flex items-center gap-2">
                <Users className="w-3 h-3" /> Student Capacity
              </div>
              <input type="number" min="1" max="500" value={editRoom.capacity || ''} onChange={e => setEditRoom({...editRoom, capacity: e.target.value})} className="w-full bg-stone-900 border border-stone-800 px-3 py-2.5 text-stone-200 text-lg font-mono focus:border-sky-600/40 focus:outline-none" />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-stone-500 font-mono mb-1.5">Floor</div>
              <div className="grid grid-cols-4 gap-2">
                {['Ground', '1st', '2nd', '3rd'].map(f => (
                  <button key={f} onClick={() => setEditRoom({...editRoom, floor: f})} className={`px-2 py-2 text-xs border transition-colors ${editRoom.floor === f ? 'border-sky-600/50 bg-sky-500/10 text-sky-300' : 'border-stone-800 text-stone-400 hover:border-stone-700'}`}>{f}</button>
                ))}
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <button onClick={() => setEditRoom(null)} className="px-3 py-2 text-[10px] uppercase tracking-wider font-mono border border-stone-700 text-stone-400">Cancel</button>
              <button onClick={saveEditRoom} className="ml-auto px-4 py-2 text-[10px] uppercase tracking-wider font-mono border border-sky-600/50 bg-sky-500/10 text-sky-300 hover:bg-sky-500/20 flex items-center gap-2">
                <CheckCircle2 className="w-3 h-3" /> Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EDIT BATCH MODAL */}
      {editBatch && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur z-50 flex items-center justify-center p-4" onClick={() => setEditBatch(null)}>
          <div className="w-full max-w-md bg-stone-950 border border-sky-700/40 p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <div>
                <div className="text-[10px] uppercase tracking-[0.25em] text-sky-400/70 font-mono">Edit Batch</div>
                <h3 className="text-xl text-stone-100 font-light mt-1" style={{fontFamily: 'Fraunces, serif'}}>Update batch details</h3>
                <div className="text-stone-500 text-[11px] mt-1">Editing: <span className="text-sky-300">{batches.find(b => b.id === editBatch.id)?.name}</span></div>
              </div>
              <button onClick={() => setEditBatch(null)} className="text-stone-500 hover:text-stone-300 shrink-0">
                <XCircle className="w-5 h-5" />
              </button>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-stone-500 font-mono mb-1.5">Batch Name</div>
              <input value={editBatch.name || ''} onChange={e => setEditBatch({...editBatch, name: e.target.value})} className="w-full bg-stone-900 border border-stone-800 px-3 py-2.5 text-stone-200 text-sm focus:border-sky-600/40 focus:outline-none" autoFocus />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-stone-500 font-mono mb-1.5">Wing</div>
              <div className="grid grid-cols-2 gap-2">
                {['Senior', 'Junior'].map(w => (
                  <button key={w} onClick={() => setEditBatch({...editBatch, wing: w})} className={`px-3 py-2 text-xs border transition-colors ${editBatch.wing === w ? 'border-sky-600/50 bg-sky-500/10 text-sky-300' : 'border-stone-800 text-stone-400 hover:border-stone-700'}`}>{w}</button>
                ))}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-stone-500 font-mono mb-1.5 flex items-center gap-2">
                <Users className="w-3 h-3" /> Student Strength
              </div>
              <input type="number" min="1" max="500" value={editBatch.strength || ''} onChange={e => setEditBatch({...editBatch, strength: e.target.value})} className="w-full bg-stone-900 border border-stone-800 px-3 py-2.5 text-stone-200 text-lg font-mono focus:border-sky-600/40 focus:outline-none" />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-stone-500 font-mono mb-1.5">Class Teacher</div>
              <select value={editBatch.classTeacher || ''} onChange={e => setEditBatch({...editBatch, classTeacher: e.target.value})} className="w-full bg-stone-900 border border-stone-800 px-3 py-2.5 text-stone-200 text-sm focus:border-sky-600/40 focus:outline-none">
                <option value="">— No class teacher —</option>
                {teachers.map(t => {
                  const first = t.name.split(' ')[0];
                  return <option key={t.id} value={first}>{t.name} ({t.subjects?.[0] || '—'})</option>;
                })}
              </select>
            </div>
            <div className="flex gap-2 pt-2">
              <button onClick={() => setEditBatch(null)} className="px-3 py-2 text-[10px] uppercase tracking-wider font-mono border border-stone-700 text-stone-400">Cancel</button>
              <button onClick={saveEditBatch} className="ml-auto px-4 py-2 text-[10px] uppercase tracking-wider font-mono border border-sky-600/50 bg-sky-500/10 text-sky-300 hover:bg-sky-500/20 flex items-center gap-2">
                <CheckCircle2 className="w-3 h-3" /> Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONTACT MODAL */}
      {contactTeacher && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur z-50 flex items-center justify-center p-4" onClick={() => setContactTeacher(null)}>
          <div className="w-full max-w-sm bg-gradient-to-b from-stone-950 to-stone-900 border border-amber-700/40 relative" onClick={e => e.stopPropagation()} style={{boxShadow: '0 0 80px rgba(217,164,65,0.15)'}}>
            {/* Corner ornaments */}
            <div className="absolute -top-0.5 -left-0.5 w-3 h-3 border-t border-l border-amber-500/70" />
            <div className="absolute -top-0.5 -right-0.5 w-3 h-3 border-t border-r border-amber-500/70" />
            <div className="absolute -bottom-0.5 -left-0.5 w-3 h-3 border-b border-l border-amber-500/70" />
            <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 border-b border-r border-amber-500/70" />

            <button onClick={() => setContactTeacher(null)} className="absolute top-3 right-3 text-stone-500 hover:text-stone-300 z-10">
              <XCircle className="w-5 h-5" />
            </button>

            <div className="p-6 md:p-8 text-center border-b border-stone-800">
              <div className="text-[10px] uppercase tracking-[0.3em] text-amber-500/70 font-mono mb-3">Faculty Contact</div>

              {/* Avatar */}
              {photos[contactTeacher.id] ? (
                <img src={photos[contactTeacher.id]} alt={contactTeacher.name} className="w-20 h-20 object-cover border border-amber-700/40 mx-auto mb-4" />
              ) : (
                <div className="w-20 h-20 border border-amber-700/40 bg-amber-500/10 flex items-center justify-center text-amber-300 mx-auto mb-4 text-2xl" style={{fontFamily: 'Fraunces, serif'}}>
                  {contactTeacher.name.split(' ').map(n => n[0]).slice(0,2).join('')}
                </div>
              )}

              <h2 className="text-2xl text-stone-100 font-light tracking-tight" style={{fontFamily: 'Fraunces, serif'}}>{contactTeacher.name}</h2>
              <div className="text-stone-500 text-[10px] uppercase tracking-[0.2em] font-mono mt-1">{contactTeacher.subjects.join(' · ')} · {contactTeacher.wing} Wing</div>

              {contactTeacher.status === 'leave' && <div className="mt-3"><Pill variant="warning">Currently on leave</Pill></div>}
              {contactTeacher.status === 'oncall' && <div className="mt-3"><Pill variant="info">On-Call</Pill></div>}
              {contactTeacher.status === 'active' && <div className="mt-3"><Pill variant="live">Available</Pill></div>}
            </div>

            <div className="p-6 md:p-8">
              {/* Phone number display */}
              <div className="text-center mb-5">
                <div className="text-[10px] uppercase tracking-wider text-stone-500 font-mono mb-1">Mobile Number</div>
                <div className="text-2xl text-stone-100 font-mono tracking-wide" style={{fontFamily: 'Fraunces, serif'}}>{contactTeacher.phone}</div>
              </div>

              {/* Action buttons */}
              <div className="grid grid-cols-2 gap-2 mb-3">
                <a href={`tel:${contactTeacher.phone.replace(/\s+/g, '')}`} className="flex items-center justify-center gap-2 border border-emerald-700/50 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 py-3 text-xs uppercase tracking-wider font-mono transition-colors">
                  <Phone className="w-4 h-4" strokeWidth={2} /> Call Now
                </a>
                <a href={`https://wa.me/${contactTeacher.phone.replace(/[^0-9]/g, '')}`} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 border border-emerald-700/50 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 py-3 text-xs uppercase tracking-wider font-mono transition-colors">
                  <Send className="w-4 h-4" strokeWidth={2} /> WhatsApp
                </a>
              </div>

              {/* Edit & Delete */}
              <div className="grid grid-cols-2 gap-2 mb-3">
                <button onClick={() => { setEditTeacher({...contactTeacher, subjects: [...(contactTeacher.subjects || [''])]}); setContactTeacher(null); }} className="flex items-center justify-center gap-2 border border-sky-700/50 bg-sky-500/5 hover:bg-sky-500/10 text-sky-300 py-2 text-[10px] uppercase tracking-wider font-mono transition-colors">
                  <Pencil className="w-3 h-3" strokeWidth={2} /> Edit Details
                </button>
                <button onClick={() => deleteTeacher(contactTeacher)} className="flex items-center justify-center gap-2 border border-red-700/40 bg-red-500/5 hover:bg-red-500/10 text-red-300 py-2 text-[10px] uppercase tracking-wider font-mono transition-colors">
                  <XCircle className="w-3 h-3" strokeWidth={2} /> Delete
                </button>
              </div>

              {/* Quick stats */}
              <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-stone-800">
                <div className="text-center">
                  <div className="text-[9px] uppercase tracking-wider text-stone-600 font-mono">Today</div>
                  <div className="text-lg font-light text-amber-300 mt-0.5" style={{fontFamily: 'Fraunces, serif'}}>{contactTeacher.hours.toFixed(1)}<span className="text-[10px] text-stone-500 ml-0.5">hr</span></div>
                </div>
                <div className="text-center border-l border-stone-800">
                  <div className="text-[9px] uppercase tracking-wider text-stone-600 font-mono">Slots</div>
                  <div className="text-lg font-light text-stone-100 mt-0.5" style={{fontFamily: 'Fraunces, serif'}}>{contactTeacher.slots}</div>
                </div>
                <div className="text-center border-l border-stone-800">
                  <div className="text-[9px] uppercase tracking-wider text-stone-600 font-mono">Load</div>
                  <div className="text-xs text-stone-300 mt-2">{contactTeacher.hours >= 8 ? 'Heavy' : contactTeacher.hours >= 5 ? 'Optimal' : 'Light'}</div>
                </div>
              </div>

              <div className="text-[10px] text-stone-600 font-mono text-center mt-4 italic">
                Tap "Call Now" to dial · "WhatsApp" to message
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const FreeFinder = () => {
  const [toast, setToast] = useState(null);
  const [assignedSubs, setAssignedSubs] = useState([]); // names of teachers assigned

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const assignSubstitute = (sub) => {
    if (!sub.available) return;
    setAssignedSubs([...assignedSubs, sub.name]);
    showToast(`✓ ${sub.name} assigned as substitute for ${SUB_SUGGEST.teacher}'s ${SUB_SUGGEST.affectedClasses} classes. WhatsApp message sent.`);
  };

  const quickAssign = (teacher) => {
    showToast(`✓ ${teacher.name} reserved for next free slot. They'll receive a WhatsApp notification with class details.`);
  };

  return (
  <div className="space-y-6">
    {toast && (
      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 border border-emerald-700/50 bg-emerald-500/10 backdrop-blur px-4 py-3 text-emerald-200 text-xs max-w-md shadow-2xl flex items-center gap-2 animate-in fade-in slide-in-from-top">
        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
        <span className="flex-1">{toast.msg}</span>
        <button onClick={() => setToast(null)} className="text-emerald-400/70 hover:text-emerald-300"><XCircle className="w-3.5 h-3.5" /></button>
      </div>
    )}

    <div className="border-b border-stone-800 pb-4">
      <div className="text-[10px] uppercase tracking-[0.25em] text-amber-500/70 font-mono mb-1">Module 06 · Substitute Engine</div>
      <h1 className="text-3xl md:text-4xl font-light tracking-tight text-stone-50" style={{fontFamily: 'Fraunces, serif'}}>Who is <span className="italic text-amber-300/90">free</span> now?</h1>
      <p className="text-stone-500 text-sm mt-1">Real-time availability with smart match scoring.</p>
    </div>

    <div className="border border-amber-700/40 bg-gradient-to-r from-amber-500/5 to-transparent p-5 md:p-6">
      <div className="flex items-start gap-4">
        <div className="w-10 h-10 border border-amber-700/40 bg-amber-500/10 flex items-center justify-center shrink-0">
          <AlertTriangle className="w-4 h-4 text-amber-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] uppercase tracking-[0.25em] text-amber-400/80 font-mono mb-1">Substitute needed</div>
          <h3 className="text-lg md:text-xl text-stone-100 font-light mb-1" style={{fontFamily: 'Fraunces, serif'}}>{SUB_SUGGEST.teacher} is on leave today</h3>
          <p className="text-stone-400 text-xs md:text-sm">Subject: <span className="text-amber-300">{SUB_SUGGEST.subject}</span> · {SUB_SUGGEST.affectedClasses} classes affected · Last: <span className="italic">Akbar's Reforms</span> · Next: <span className="italic">Mughal Decline</span></p>
        </div>
      </div>
      <div className="mt-5 space-y-2">
        <div className="text-[10px] uppercase tracking-wider text-stone-500 font-mono mb-2">Recommended — ranked by match score</div>
        {SUB_SUGGEST.suggestions.map((s, i) => {
          const isAssigned = assignedSubs.includes(s.name);
          return (
            <div key={i} className={`flex items-center gap-3 md:gap-4 border ${isAssigned ? 'border-emerald-600/70 bg-emerald-500/10' : i === 0 ? 'border-emerald-700/40 bg-emerald-500/5' : 'border-stone-800 bg-stone-950/40'} p-3 flex-wrap md:flex-nowrap transition-colors`}>
              <div className="text-2xl font-light w-10 md:w-12 text-center shrink-0" style={{fontFamily: 'Fraunces, serif', color: i === 0 ? '#86efac' : '#a8a29e'}}>{s.matchScore}</div>
              <div className="flex-1 min-w-0">
                <div className="text-stone-100 text-sm">{s.name}</div>
                <div className="text-stone-500 text-[10px] uppercase tracking-wider font-mono mt-0.5">{s.subject}</div>
                <div className="text-stone-400 text-[11px] mt-1">{s.reason}</div>
              </div>
              <button onClick={() => assignSubstitute(s)} disabled={!s.available || isAssigned} className={`px-3 py-1.5 text-[10px] uppercase tracking-wider font-mono border transition-colors shrink-0 flex items-center gap-1.5 ${isAssigned ? 'border-emerald-600/70 bg-emerald-500/15 text-emerald-300 cursor-default' : s.available ? (i === 0 ? 'border-emerald-600/50 text-emerald-300 hover:bg-emerald-500/10' : 'border-stone-700 text-stone-300 hover:bg-stone-800') : 'border-stone-800 text-stone-700 cursor-not-allowed'}`}>
                {isAssigned ? <><CheckCircle2 className="w-3 h-3" /> Assigned</> : s.available ? 'Assign' : 'Busy'}
              </button>
            </div>
          );
        })}
      </div>
    </div>

    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
      {FREE_NOW.map((t, i) => (
        <div key={i} className="border border-stone-800 bg-stone-950/40 p-5 hover:border-emerald-700/40 transition-all">
          <div className="flex items-start justify-between mb-3">
            <div className="min-w-0">
              <div className="text-stone-100 text-sm truncate">{t.name}</div>
              <div className="text-stone-500 text-[10px] uppercase tracking-wider font-mono mt-0.5 truncate">{t.subjects.join(' · ')}</div>
            </div>
            <Pill variant="live">Free</Pill>
          </div>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <div className="text-[9px] uppercase tracking-wider text-stone-600 font-mono mb-0.5">Free until</div>
              <div className="text-lg font-light text-emerald-300" style={{fontFamily: 'Fraunces, serif'}}>{t.freeUntil}</div>
            </div>
            <div>
              <div className="text-[9px] uppercase tracking-wider text-stone-600 font-mono mb-0.5">Load</div>
              <div className="text-sm text-stone-200 mt-1">{t.workload}</div>
            </div>
          </div>
          <button onClick={() => quickAssign(t)} className="w-full border border-stone-800 hover:border-amber-600/40 hover:bg-amber-500/5 hover:text-amber-300 text-stone-400 py-2 text-[10px] uppercase tracking-wider font-mono transition-colors">
            Quick Assign →
          </button>
        </div>
      ))}
    </div>
  </div>
  );
};

const ConflictsView = ({ conflicts = CONFLICTS, setConflicts = () => {}, cells = INITIAL_CELLS, onGoToTimetable = () => {} }) => {
  const [lastResolved, setLastResolved] = useState(null);
  // LIVE conflicts auto-computed from current timetable cells
  const liveConflicts = computeLiveConflicts(cells);
  // Merge: live conflicts FIRST (most urgent), then user-dismissable static conflicts
  const allConflicts = [...liveConflicts, ...conflicts];
  // Derive resolved count from how many static have been removed (initial 12 + fixed-so-far)
  const resolvedCount = 12 + (CONFLICTS.length - conflicts.length);

  const applyFix = (index) => {
    const fixed = conflicts[index];
    setLastResolved(fixed);
    setConflicts(conflicts.filter((_, i) => i !== index));
    setTimeout(() => setLastResolved(null), 3500);
  };

  const dismissConflict = (index) => {
    setConflicts(conflicts.filter((_, i) => i !== index));
  };

  const counts = {
    critical: conflicts.filter(c => c.severity === 'critical').length,
    warning: conflicts.filter(c => c.severity === 'warning').length,
    info: conflicts.filter(c => c.severity === 'info').length,
  };

  return (
    <div className="space-y-6">
      <div className="border-b border-stone-800 pb-4">
        <div className="text-[10px] uppercase tracking-[0.25em] text-amber-500/70 font-mono mb-1">Module 05 · Quality Control</div>
        <h1 className="text-3xl md:text-4xl font-light tracking-tight text-stone-50" style={{fontFamily: 'Fraunces, serif'}}>Conflicts & anomalies</h1>
        <p className="text-stone-500 text-sm mt-1">
          {liveConflicts.length > 0 && <span className="text-red-300">{liveConflicts.length} LIVE conflict{liveConflicts.length !== 1 ? 's' : ''} from current schedule</span>}
          {liveConflicts.length > 0 && conflicts.length > 0 && ' · '}
          {conflicts.length > 0 && <>{conflicts.length} static issue{conflicts.length !== 1 ? 's' : ''}</>}
          {allConflicts.length === 0 && 'No issues — schedule is clean ✓'}
        </p>
      </div>

      {lastResolved && (
        <div className="border border-emerald-700/50 bg-emerald-500/10 p-3 flex items-center gap-3 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <div className="flex-1 text-xs">
            <span className="text-emerald-300">Resolved:</span> <span className="text-stone-200">{lastResolved.location}</span>
            <span className="text-stone-500 italic"> — {lastResolved.suggestion}</span>
          </div>
          <button onClick={() => setLastResolved(null)} className="text-emerald-400/70 hover:text-emerald-300">
            <XCircle className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-stone-800">
        <Stat label="LIVE Clashes" value={liveConflicts.length} suffix="auto" accent={liveConflicts.length > 0 ? "text-red-400" : "text-emerald-400"} trend={liveConflicts.length === 0 ? 'No live issues ✓' : 'Fix in Schedule'} />
        <Stat label="Critical" value={counts.critical} suffix="HIGH" accent="text-red-400" trend={counts.critical === 0 ? 'All cleared ✓' : 'Immediate'} />
        <Stat label="Warnings" value={counts.warning} suffix="MED" accent="text-amber-400" trend="This week" />
        <Stat label="Resolved" value={resolvedCount} suffix="total" accent="text-emerald-400" trend="By you & team" />
      </div>

      {allConflicts.length === 0 ? (
        <div className="border border-emerald-700/40 bg-emerald-500/5 p-12 text-center">
          <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-4" strokeWidth={1.5} />
          <h3 className="text-2xl text-stone-100 font-light mb-1" style={{fontFamily: 'Fraunces, serif'}}>All clear, sir.</h3>
          <p className="text-stone-400 text-sm">No conflicts in the current schedule. Excellent work.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {allConflicts.map((c, i) => {
            const staticIdx = c.isLive ? -1 : i - liveConflicts.length;
            return (
              <div key={c.id || `${c.location}-${i}`} className={`border ${c.isLive ? 'border-red-700/60 bg-red-500/[0.04] shadow-[0_0_15px_rgba(239,68,68,0.1)]' : 'border-stone-800 bg-stone-950/40'} hover:bg-stone-900/40 transition-colors`}>
                <div className="flex items-stretch">
                  <div className={`w-1 ${c.isLive ? 'bg-red-500 animate-pulse' : c.severity === 'critical' ? 'bg-red-500' : c.severity === 'warning' ? 'bg-amber-500' : 'bg-sky-500'}`} />
                  <div className="flex-1 p-4">
                    <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="text-stone-600 font-mono text-xs">#{String(i+1).padStart(2,'0')}</span>
                        <Pill variant={c.severity}>{c.severity}</Pill>
                        {c.isLive && (
                          <span className="text-[10px] uppercase tracking-wider font-mono px-2 py-0.5 bg-red-500/20 text-red-300 border border-red-700/50 animate-pulse">● LIVE</span>
                        )}
                        <span className="text-stone-400 text-xs uppercase tracking-wider font-mono">{c.type}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="text-stone-600 text-[10px] font-mono">{c.isLive ? 'now' : '5 min ago'}</div>
                        {!c.isLive && (
                          <button onClick={() => dismissConflict(staticIdx)} className="text-stone-600 hover:text-stone-400" title="Dismiss without resolving">
                            <XCircle className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="text-stone-100 text-sm mb-1.5" style={{fontFamily: 'Fraunces, serif'}}>{c.location}</div>
                    <div className="text-stone-400 text-xs mb-3 leading-relaxed">{c.details}</div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="text-[10px] uppercase tracking-wider text-emerald-400/70 font-mono">Suggested →</div>
                      <div className="text-emerald-300/80 text-xs italic flex-1 min-w-0">{c.suggestion}</div>
                      {c.isLive ? (
                        <button onClick={onGoToTimetable} className="px-3 py-1.5 text-[10px] uppercase tracking-wider font-mono border border-red-600/60 text-red-300 hover:border-red-500/80 hover:bg-red-500/10 transition-colors shrink-0 flex items-center gap-1.5">
                          <Calendar className="w-3 h-3" /> Fix in Schedule
                        </button>
                      ) : (
                        <button onClick={() => applyFix(staticIdx)} className="px-3 py-1.5 text-[10px] uppercase tracking-wider font-mono border border-emerald-600/40 text-emerald-300 hover:border-emerald-500/70 hover:bg-emerald-500/10 transition-colors shrink-0 flex items-center gap-1.5">
                          <CheckCircle2 className="w-3 h-3" /> Apply Fix
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

const AnalyticsView = () => {
  const maxHours = Math.max(...SUBJECT_BREAKDOWN.map(s => s.hours));
  const maxTime = Math.max(...TIME_BREAKDOWN.map(t => t.hours));
  return (
    <div className="space-y-8">
      <div className="border-b border-stone-800 pb-4">
        <div className="text-[10px] uppercase tracking-[0.25em] text-amber-500/70 font-mono mb-1">Module 10 · Intelligence</div>
        <h1 className="text-3xl md:text-4xl font-light tracking-tight text-stone-50" style={{fontFamily: 'Fraunces, serif'}}>Academic <span className="italic text-amber-300/90">analytics</span></h1>
        <p className="text-stone-500 text-sm mt-1">Wing, subject, and time-of-day distribution.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="border border-stone-800 bg-stone-950/40 p-6">
          <div className="text-[10px] uppercase tracking-[0.25em] text-stone-500 font-mono mb-4">By Wing</div>
          <div className="space-y-5">
            <div>
              <div className="flex justify-between items-baseline mb-2">
                <span className="text-stone-200 text-sm">Senior Wing</span>
                <span className="text-amber-300 text-2xl font-light" style={{fontFamily: 'Fraunces, serif'}}>136<span className="text-xs text-stone-500 ml-1">hrs</span></span>
              </div>
              <div className="h-1.5 bg-stone-900"><div className="h-full bg-amber-500/60" style={{width: '79.6%'}} /></div>
              <div className="text-[10px] text-stone-500 font-mono mt-1">27 teachers · 126 slots · 79.6%</div>
            </div>
            <div>
              <div className="flex justify-between items-baseline mb-2">
                <span className="text-stone-200 text-sm">Junior Wing</span>
                <span className="text-sky-300 text-2xl font-light" style={{fontFamily: 'Fraunces, serif'}}>34.75<span className="text-xs text-stone-500 ml-1">hrs</span></span>
              </div>
              <div className="h-1.5 bg-stone-900"><div className="h-full bg-sky-500/50" style={{width: '20.4%'}} /></div>
              <div className="text-[10px] text-stone-500 font-mono mt-1">9 teachers · 39 slots · 20.4%</div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-2 border border-stone-800 bg-stone-950/40 p-6">
          <div className="text-[10px] uppercase tracking-[0.25em] text-stone-500 font-mono mb-4">Subject distribution</div>
          <div className="space-y-2">
            {SUBJECT_BREAKDOWN.map((s, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-24 md:w-32 text-xs text-stone-300 text-right truncate">{s.subject}</div>
                <div className="flex-1 h-6 bg-stone-900 relative overflow-hidden">
                  <div className={`h-full ${i < 3 ? 'bg-gradient-to-r from-amber-600/70 to-amber-500/40' : 'bg-stone-700/60'}`} style={{width: `${(s.hours / maxHours) * 100}%`}} />
                  <div className="absolute inset-0 flex items-center px-2 text-[10px] font-mono text-stone-300">{s.slots} slots</div>
                </div>
                <div className="w-16 text-right shrink-0">
                  <span className={`text-sm font-light ${i < 3 ? 'text-amber-300' : 'text-stone-300'}`} style={{fontFamily: 'Fraunces, serif'}}>{s.hours.toFixed(1)}</span>
                  <span className="text-[10px] text-stone-500 ml-1">hr</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="border border-stone-800 bg-stone-950/40 p-6">
        <div className="flex justify-between items-center mb-5 flex-wrap gap-2">
          <div className="text-[10px] uppercase tracking-[0.25em] text-stone-500 font-mono">Activity heatmap — by time of day</div>
          <div className="text-[10px] uppercase tracking-wider text-stone-600 font-mono">Total: 170.75 hrs</div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-px bg-stone-800">
          {TIME_BREAKDOWN.map((t, i) => {
            const intensity = (t.hours / maxTime);
            return (
              <div key={i} className="bg-stone-950/60 p-5 relative overflow-hidden">
                <div className="absolute inset-0 bg-amber-500/10" style={{opacity: intensity * 0.6}} />
                <div className="relative">
                  <div className="text-[10px] uppercase tracking-wider text-stone-500 font-mono">{t.window}</div>
                  <div className="text-[9px] text-stone-600 font-mono mb-3">{t.range}</div>
                  <div className="text-3xl font-light text-stone-100" style={{fontFamily: 'Fraunces, serif'}}>{t.hours.toFixed(1)}</div>
                  <div className="text-[10px] text-stone-500 font-mono mt-1">{t.slots} slots · {((t.hours / 170.75) * 100).toFixed(0)}%</div>
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-4 text-[11px] text-stone-500 italic border-l-2 border-amber-600/40 pl-3" style={{fontFamily: 'Fraunces, serif'}}>
          Insight: 51% of teaching load is in morning (08:00–12:00). Consider redistributing afternoon batches to ease room pressure.
        </div>
      </div>
    </div>
  );
};

const TimetableView = ({ role = 'director', addNotification = () => {}, cells: _cellsToday = {}, cellsByDay = {}, todayDayKey = 'Mon', copyDayToDays = async () => {}, setCells = () => {}, saveCellToDB = async () => {}, teachers = [], classrooms = [], batches = [], timeSlots = [], currentTime = '08:00' }) => {
  // Use dynamic time slots if available, otherwise fallback to default hardcoded
  const FALLBACK_TIMES = ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00'];
  const times = timeSlots.length > 0 ? timeSlots.map(s => s.startTime) : FALLBACK_TIMES;
  // Helper: get slot details by start time
  const getSlot = (startTime) => timeSlots.find(s => s.startTime === startTime);
  const isManager = role === 'manager';
  // DYNAMIC: batch names list from batches state (NEW batches added auto-appear as columns)
  const batchList = batches.map(b => b.name);
  // Batch → strength lookup for capacity warnings
  const batchStrengthMap = batches.reduce((acc, b) => { acc[b.name] = b.strength; return acc; }, {});
  const [assignSlot, setAssignSlot] = useState(null);
  const [pickSubject, setPickSubject] = useState('Maths');
  const [pickTeacher, setPickTeacher] = useState('Praveen');
  const [pickRoom, setPickRoom] = useState('S-101');
  const [viewMode, setViewMode] = useState('daily'); // daily, weekly, byTeacher, byRoom
  const [weeklyBatch, setWeeklyBatch] = useState('11th A');
  const days = ['Mon','Tue','Wed','Thu','Fri','Sat'];

  // DATE NAVIGATION — Primary state is selectedDate, selectedDay is derived
  // selectedDate is YYYY-MM-DD format (ISO date string)
  const istTodayISO = (() => {
    const istDate = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    const y = istDate.getFullYear();
    const m = String(istDate.getMonth() + 1).padStart(2, '0');
    const d = String(istDate.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  })();
  const [selectedDate, setSelectedDate] = useState(istTodayISO);

  // Derive day name (Mon/Tue/...) from selectedDate
  const DAYS_SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const DAYS_FULL = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const MONTHS_FULL = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  // Parse selectedDate ('YYYY-MM-DD') — use noon UTC to avoid timezone shifting the day
  const [sy, sm, sd] = selectedDate.split('-').map(Number);
  const selectedDateObj = new Date(sy, sm - 1, sd, 12, 0, 0);
  const selectedDay = DAYS_SHORT[selectedDateObj.getDay()];
  const selectedDateFull = `${DAYS_FULL[selectedDateObj.getDay()]}, ${sd} ${MONTHS_FULL[sm - 1]} ${sy}`;
  const isToday = selectedDate === istTodayISO;
  const todayDateObj = new Date(istTodayISO);
  const daysDiff = Math.round((selectedDateObj - todayDateObj) / (1000 * 60 * 60 * 24));
  const isPastDate = daysDiff < 0;
  const isFutureDate = daysDiff > 0;

  // Helper: shift selectedDate by N days
  const shiftDate = (deltaDays) => {
    const d = new Date(selectedDateObj);
    d.setDate(d.getDate() + deltaDays);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    setSelectedDate(`${y}-${m}-${dd}`);
  };

  // When user clicks a day tab, jump to the most recent occurrence of that day (this week or last)
  const handleDayTabClick = (day) => {
    const targetIdx = DAYS_SHORT.indexOf(day);
    const todayIdx = todayDateObj.getDay();
    let offset = todayIdx - targetIdx;
    if (offset < 0) offset += 7;
    const d = new Date(todayDateObj);
    d.setDate(d.getDate() - offset);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    setSelectedDate(`${y}-${m}-${dd}`);
  };

  // DAY-AWARE: cells for the currently selected day
  const cells = cellsByDay[selectedDay] || {};
  // Copy Day modal state
  const [showCopyModal, setShowCopyModal] = useState(false);
  const [copyTargets, setCopyTargets] = useState({});
  const [copyInProgress, setCopyInProgress] = useState(false);

  // Today's full date (for non-manager bottom subtitle)
  const istNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const todayFullDate = `${DAYS_FULL[istNow.getDay()]}, ${istNow.getDate()} ${MONTHS_FULL[istNow.getMonth()]} ${istNow.getFullYear()}`;

  // Find which cells are part of LIVE conflicts (same teacher or room at same time)
  const conflictingCells = findConflictingCells(cells);

  const colorMap = {
    'Maths': 'border-amber-700/40 text-amber-300', 'Eng': 'border-sky-700/40 text-sky-300',
    'Phy': 'border-purple-700/40 text-purple-300', 'Chem': 'border-emerald-700/40 text-emerald-300',
    'Hist': 'border-orange-700/40 text-orange-300', 'Geo': 'border-teal-700/40 text-teal-300',
    'Pol': 'border-rose-700/40 text-rose-300', 'GS': 'border-indigo-700/40 text-indigo-300',
    'Hindi': 'border-pink-700/40 text-pink-300', 'Bio': 'border-lime-700/40 text-lime-300',
    'PD': 'border-fuchsia-700/40 text-fuchsia-300', 'SST': 'border-cyan-700/40 text-cyan-300',
  };

  const subjectOptions = ['Maths', 'Eng', 'Phy', 'Chem', 'Bio', 'Hist', 'Geo', 'Pol', 'GS', 'Hindi', 'PD', 'SST'];

  // Subject → short code mapping (so any teacher's subject text maps to color-coded short)
  const subjectShortMap = {
    'NDA Mathematics': 'Maths', 'Mathematics Academics': 'Maths', 'Academic Maths': 'Maths',
    'CDS AFCAT Maths': 'Maths', 'NDA Maths': 'Maths', 'Mathematics': 'Maths', 'Maths': 'Maths',
    'Acad Maths': 'Maths', 'NDA Math': 'Maths',
    'Physics': 'Phy', 'Phy': 'Phy',
    'Chemistry': 'Chem', 'Chem': 'Chem',
    'Bio': 'Bio', 'Biology': 'Bio',
    'English': 'Eng', 'Eng': 'Eng',
    'Hindi': 'Hindi',
    'History': 'Hist', 'Hist': 'Hist',
    'Geography': 'Geo', 'Geo': 'Geo',
    'Polity': 'Pol', 'Pol': 'Pol',
    'GS': 'GS', 'GS, SST': 'GS', 'SST': 'SST',
    'PD': 'PD',
    'Mother Teacher': 'Eng', // default to English for mother teacher
  };

  // Helper: get a teacher's short name (use short_name field if available, else first word)
  const getTeacherShortName = (t) => t?.short_name || t?.name?.split(' ')[0] || '';

  // Helper: is teacher active? (forgiving — treats missing/null status as active)
  const isActiveTeacher = (t) => !t?.status || t.status === 'active';

  // DYNAMIC: build teacher short names + subject map from current teachers state
  // Uses UNIQUE short_name (so Devesh Shukla and Devesh Yadav don't collide!)
  const teacherShortNames = teachers
    .filter(isActiveTeacher)
    .map(getTeacherShortName)
    .filter((v, i, a) => v && a.indexOf(v) === i)
    .sort(); // alphabetical

  // Map: shortName → subject short code
  // E.g. 'Devesh Shukla' → 'Maths', 'Devesh Yadav' → 'Phy' (NOT 'Maths'!)
  const teacherSubjectMap = teachers.reduce((acc, t) => {
    const shortName = getTeacherShortName(t);
    if (!shortName || acc[shortName]) return acc;
    const primarySubj = t.subjects?.[0] || '';
    acc[shortName] = subjectShortMap[primarySubj] || 'Maths';
    return acc;
  }, {});

  // REVERSE: subject short code → list of teachers who teach that subject
  // Used to FILTER teacher dropdown based on selected subject
  const teachersBySubject = teachers.reduce((acc, t) => {
    if (!isActiveTeacher(t)) return acc;
    const shortName = getTeacherShortName(t);
    if (!shortName) return acc;
    const primarySubj = t.subjects?.[0] || '';
    const subjShort = subjectShortMap[primarySubj] || 'Maths';
    if (!acc[subjShort]) acc[subjShort] = [];
    if (!acc[subjShort].includes(shortName)) acc[subjShort].push(shortName);
    return acc;
  }, {});

  // DYNAMIC: room list from classrooms state (NEW rooms added auto-appear here)
  const roomOptions = classrooms.map(r => r.name);
  // Room → capacity lookup (for capacity warnings)
  const roomCapacityMap = classrooms.reduce((acc, r) => { acc[r.name] = r.capacity; return acc; }, {});

  // When teacher changes, auto-update subject to their actual subject (still editable)
  const onTeacherChange = (newTeacher) => {
    setPickTeacher(newTeacher);
    const suggestedSubj = teacherSubjectMap[newTeacher];
    if (suggestedSubj) setPickSubject(suggestedSubj);
  };

  // When subject changes, auto-select first available teacher who teaches this subject
  // If current teacher already teaches this subject, keep them
  const onSubjectChange = (newSubject) => {
    setPickSubject(newSubject);
    const availableTeachers = teachersBySubject[newSubject] || [];
    // If current teacher is in the list for this subject, keep them
    if (availableTeachers.includes(pickTeacher)) return;
    // Otherwise, auto-select first teacher of this subject
    if (availableTeachers.length > 0) {
      setPickTeacher(availableTeachers[0]);
    }
    // If no teachers teach this subject, keep current (user can manually override)
  };

  const openAssign = (key) => {
    if (!isManager) return;
    const existing = cells[key];
    if (existing) {
      setPickSubject(existing.subj || '');
      setPickTeacher(existing.tch);
      setPickRoom(existing.room || (classrooms[0]?.name || 'HO 1'));
    } else {
      // Default: pick first teacher alphabetically, no subject preset
      const defaultTeacher = teacherShortNames[0] || '';
      setPickTeacher(defaultTeacher);
      setPickSubject(teacherSubjectMap[defaultTeacher] || '');
      setPickRoom(classrooms[0]?.name || 'HO 1');
    }
    setAssignSlot(key);
  };

  const [saveToast, setSaveToast] = useState(null);

  const teacherFullName = (shortName) => {
    const t = teachers.find(t => t.name.split(' ')[0] === shortName);
    return t?.name || `${shortName} Sir`;
  };

  const saveAssign = async () => {
    const slotTime = assignSlot.split('-')[0];
    const slotBatch = assignSlot.slice(slotTime.length + 1);
    const existing = cells[assignSlot];
    const isUpdate = !!existing;
    const newCellData = { subj: pickSubject, tch: pickTeacher, room: pickRoom };

    // Save to Supabase (saveCellToDB handles optimistic update + DB sync)
    if (saveCellToDB) await saveCellToDB(selectedDay, assignSlot, newCellData);

    // Fire notification (Manager → Director + affected teacher)
    if (isManager) {
      addNotification({
        type: isUpdate ? 'updated' : 'assigned',
        slot: assignSlot,
        time: slotTime,
        batch: slotBatch,
        teacher: pickTeacher,
        teacherFullName: teacherFullName(pickTeacher),
        subject: pickSubject,
        room: pickRoom,
        prev: isUpdate ? { teacher: existing.tch, subject: existing.subj, room: existing.room } : null,
        hadConflict: hasConflict,
      });
      // Also notify the PREVIOUSLY assigned teacher (if different from new one) that their class was removed/reassigned
      if (isUpdate && existing.tch !== pickTeacher) {
        addNotification({
          type: 'removed',
          slot: assignSlot,
          time: slotTime,
          batch: slotBatch,
          teacher: existing.tch,
          teacherFullName: teacherFullName(existing.tch),
          subject: existing.subj,
          room: existing.room,
          reassignedTo: pickTeacher,
        });
      }
      setSaveToast({
        msg: `${isUpdate ? 'Updated' : 'Assigned'}: ${teacherFullName(pickTeacher)} → ${slotBatch} @ ${slotTime} (${selectedDay}) · Director & ${pickTeacher} Sir notified.`,
        type: hasConflict ? 'warning' : 'success',
      });
      setTimeout(() => setSaveToast(null), 4500);
    }
    setAssignSlot(null);
  };

  const clearSlot = async () => {
    const slotTime = assignSlot.split('-')[0];
    const slotBatch = assignSlot.slice(slotTime.length + 1);
    const existing = cells[assignSlot];

    // Delete from Supabase (saveCellToDB handles optimistic update + DB delete)
    if (saveCellToDB) await saveCellToDB(selectedDay, assignSlot, null);

    if (isManager && existing) {
      addNotification({
        type: 'removed',
        slot: assignSlot,
        time: slotTime,
        batch: slotBatch,
        teacher: existing.tch,
        teacherFullName: teacherFullName(existing.tch),
        subject: existing.subj,
        room: existing.room,
      });
      setSaveToast({
        msg: `Removed: ${slotBatch} @ ${slotTime} class · ${teacherFullName(existing.tch)} & Director notified.`,
        type: 'info',
      });
      setTimeout(() => setSaveToast(null), 4500);
    }
    setAssignSlot(null);
  };

  // REAL conflict detection — checks if teacher is busy OR room is occupied at same time
  const detectConflicts = () => {
    if (!assignSlot) return { teacherClash: null, roomClash: null };
    const slotTime = assignSlot.split('-')[0];
    let teacherClash = null;
    let roomClash = null;
    Object.entries(cells).forEach(([key, c]) => {
      if (key === assignSlot) return; // skip the slot we're editing
      if (!key.startsWith(slotTime + '-')) return; // different time = no clash
      const otherBatch = key.slice(slotTime.length + 1);
      if (c.tch === pickTeacher) teacherClash = { batch: otherBatch, subj: c.subj, room: c.room };
      if (c.room === pickRoom) roomClash = { batch: otherBatch, subj: c.subj, tch: c.tch };
    });
    return { teacherClash, roomClash };
  };
  const { teacherClash, roomClash } = detectConflicts();
  const hasConflict = !!(teacherClash || roomClash);

  const filledCount = Object.keys(cells).length;
  const totalSlots = times.length * batchList.length;
  const emptySlots = totalSlots - filledCount;

  return (
    <div className="space-y-6">
      {saveToast && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 border backdrop-blur px-4 py-3 text-xs max-w-md shadow-2xl flex items-start gap-2 animate-in fade-in slide-in-from-top ${saveToast.type === 'warning' ? 'border-amber-600/60 bg-amber-500/15 text-amber-200' : saveToast.type === 'info' ? 'border-sky-700/50 bg-sky-500/10 text-sky-200' : 'border-emerald-700/50 bg-emerald-500/10 text-emerald-200'}`}>
          {saveToast.type === 'warning' ? <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> : saveToast.type === 'info' ? <Bell className="w-4 h-4 shrink-0 mt-0.5" /> : <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />}
          <span className="flex-1">{saveToast.msg}</span>
          <button onClick={() => setSaveToast(null)} className="opacity-70 hover:opacity-100"><XCircle className="w-3.5 h-3.5" /></button>
        </div>
      )}
      <div className="border-b border-stone-800 pb-4">
        <div className="text-[10px] uppercase tracking-[0.25em] text-amber-500/70 font-mono mb-1">Module 04 · {isManager ? 'Schedule Builder' : 'Schedule'}</div>
        <h1 className="text-3xl md:text-4xl font-light tracking-tight text-stone-50" style={{fontFamily: 'Fraunces, serif'}}>
          {isManager ? <>Build the <span className="italic text-amber-300/90">timetable</span></> : <>Daily timetable</>}
        </h1>
        <p className="text-stone-500 text-sm mt-1">
          {isManager ? <>Editing: <span className="text-amber-300 font-mono">{selectedDay}</span> ({selectedDateFull}) {isToday && <span className="text-emerald-400 text-xs">· Today</span>}{isPastDate && <span className="text-stone-400 text-xs">· {Math.abs(daysDiff)} days ago</span>}{isFutureDate && <span className="text-sky-400 text-xs">· {daysDiff} days ahead</span>} · Click any cell to assign teacher & subject.</> : `${selectedDateFull}${isToday ? " · Today's schedule" : isPastDate ? ` · Viewing past date (${Math.abs(daysDiff)} days ago)` : ` · Viewing future date (${daysDiff} days ahead)`}`}
        </p>
      </div>

      {isManager && (
        <div className={`border ${conflictingCells.size > 0 ? 'border-red-700/50' : 'border-amber-700/40'} bg-gradient-to-r from-amber-500/5 to-transparent p-5`}>
          <div className="flex items-start gap-4 flex-wrap">
            <div className={`w-10 h-10 border flex items-center justify-center shrink-0 ${conflictingCells.size > 0 ? 'border-red-700/40 bg-red-500/10' : 'border-amber-700/40 bg-amber-500/10'}`}>
              {conflictingCells.size > 0 ? <AlertTriangle className="w-4 h-4 text-red-400 animate-pulse" /> : <Calendar className="w-4 h-4 text-amber-400" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] uppercase tracking-[0.25em] text-amber-400/80 font-mono mb-1">Manager Builder Mode</div>
              <h3 className="text-lg text-stone-100 font-light" style={{fontFamily: 'Fraunces, serif'}}>
                {conflictingCells.size > 0 ? <>⚠️ <span className="text-red-300">{conflictingCells.size} cells in conflict</span> — RED highlights mein dikh raha hai</> : 'You have full power to schedule every class'}
              </h3>
              <p className="text-stone-400 text-xs mt-1">
                {conflictingCells.size > 0 ? 'Red cells par click karke teacher ya room change karo · Conflict turant resolve ho jayega' : 'Click empty (+) cells to assign · Click filled cells to edit or remove · System auto-checks for teacher/room clash'}
              </p>
            </div>
            <div className="grid grid-cols-4 gap-4 text-center">
              <div>
                <div className="text-2xl font-light text-amber-300" style={{fontFamily: 'Fraunces, serif'}}>{filledCount}</div>
                <div className="text-[9px] uppercase tracking-wider text-stone-500 font-mono">Filled</div>
              </div>
              <div>
                <div className="text-2xl font-light text-stone-300" style={{fontFamily: 'Fraunces, serif'}}>{emptySlots}</div>
                <div className="text-[9px] uppercase tracking-wider text-stone-500 font-mono">Empty</div>
              </div>
              <div>
                <div className={`text-2xl font-light ${conflictingCells.size > 0 ? 'text-red-400 animate-pulse' : 'text-stone-300'}`} style={{fontFamily: 'Fraunces, serif'}}>{conflictingCells.size}</div>
                <div className="text-[9px] uppercase tracking-wider text-stone-500 font-mono">Clashes</div>
              </div>
              <div>
                <div className="text-2xl font-light text-emerald-300" style={{fontFamily: 'Fraunces, serif'}}>{Math.round((filledCount/totalSlots)*100)}%</div>
                <div className="text-[9px] uppercase tracking-wider text-stone-500 font-mono">Done</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* DATE NAVIGATION BAR — view any date's timetable */}
      {viewMode === 'daily' && (
        <div className={`border ${isPastDate ? 'border-stone-700/50' : isFutureDate ? 'border-sky-700/40' : 'border-amber-700/40'} bg-gradient-to-r ${isPastDate ? 'from-stone-800/20' : isFutureDate ? 'from-sky-500/5' : 'from-amber-500/5'} to-transparent p-4`}>
          <div className="flex items-center gap-3 flex-wrap">
            <div className={`w-10 h-10 border flex items-center justify-center shrink-0 ${isPastDate ? 'border-stone-700/40 bg-stone-800/30' : isFutureDate ? 'border-sky-700/40 bg-sky-500/10' : 'border-amber-700/40 bg-amber-500/10'}`}>
              <Calendar className={`w-4 h-4 ${isPastDate ? 'text-stone-400' : isFutureDate ? 'text-sky-400' : 'text-amber-400'}`} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <div className={`text-[10px] uppercase tracking-[0.25em] font-mono ${isPastDate ? 'text-stone-400/80' : isFutureDate ? 'text-sky-400/80' : 'text-amber-400/80'}`}>
                  {isToday ? 'Today · Live View' : isPastDate ? `Past Date · ${Math.abs(daysDiff)} day${Math.abs(daysDiff) !== 1 ? 's' : ''} ago` : `Future Date · ${daysDiff} day${daysDiff !== 1 ? 's' : ''} ahead`}
                </div>
                {isPastDate && <span className="text-[9px] uppercase tracking-wider font-mono bg-stone-800/60 text-stone-400 px-2 py-0.5 border border-stone-700">📜 History</span>}
                {isFutureDate && <span className="text-[9px] uppercase tracking-wider font-mono bg-sky-500/10 text-sky-300 px-2 py-0.5 border border-sky-700/40">🔮 Planning</span>}
              </div>
              <h3 className="text-lg md:text-xl text-stone-100 font-light" style={{fontFamily: 'Fraunces, serif'}}>
                {selectedDateFull}
              </h3>
            </div>
            <div className="flex gap-1 items-center flex-wrap">
              <button onClick={() => shiftDate(-1)} className="px-2.5 py-1.5 text-[10px] uppercase tracking-wider font-mono border border-stone-700 hover:border-amber-600/50 hover:text-amber-300 text-stone-400 transition-colors flex items-center gap-1" title="Previous day">
                <ArrowLeft className="w-3 h-3" /> Prev
              </button>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                max="2099-12-31"
                className="bg-stone-950 border border-stone-700 hover:border-amber-600/50 px-2 py-1.5 text-[10px] font-mono text-stone-200 focus:outline-none focus:border-amber-600 transition-colors cursor-pointer"
                title="Pick a date"
              />
              <button onClick={() => setSelectedDate(istTodayISO)} disabled={isToday} className={`px-2.5 py-1.5 text-[10px] uppercase tracking-wider font-mono border transition-colors ${isToday ? 'border-stone-800 text-stone-700 cursor-not-allowed' : 'border-emerald-700/50 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20'}`} title="Jump to today">
                Today
              </button>
              <button onClick={() => shiftDate(1)} className="px-2.5 py-1.5 text-[10px] uppercase tracking-wider font-mono border border-stone-700 hover:border-amber-600/50 hover:text-amber-300 text-stone-400 transition-colors flex items-center gap-1" title="Next day">
                Next <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex gap-2 flex-wrap items-center">
        <button onClick={() => setViewMode('daily')} className={`px-3 py-1.5 text-[10px] uppercase tracking-wider font-mono border transition-colors ${viewMode === 'daily' ? 'border-amber-600/50 bg-amber-500/10 text-amber-300' : 'border-stone-800 text-stone-500 hover:text-stone-300 hover:border-stone-700'}`}>Daily</button>
        <button onClick={() => setViewMode('weekly')} className={`px-3 py-1.5 text-[10px] uppercase tracking-wider font-mono border transition-colors ${viewMode === 'weekly' ? 'border-amber-600/50 bg-amber-500/10 text-amber-300' : 'border-stone-800 text-stone-500 hover:text-stone-300 hover:border-stone-700'}`}>Weekly</button>
        <button onClick={() => setViewMode('byTeacher')} className={`px-3 py-1.5 text-[10px] uppercase tracking-wider font-mono border transition-colors ${viewMode === 'byTeacher' ? 'border-amber-600/50 bg-amber-500/10 text-amber-300' : 'border-stone-800 text-stone-500 hover:text-stone-300 hover:border-stone-700'}`}>By Teacher</button>
        <button onClick={() => setViewMode('byRoom')} className={`px-3 py-1.5 text-[10px] uppercase tracking-wider font-mono border transition-colors ${viewMode === 'byRoom' ? 'border-amber-600/50 bg-amber-500/10 text-amber-300' : 'border-stone-800 text-stone-500 hover:text-stone-300 hover:border-stone-700'}`}>By Room</button>
        {viewMode === 'weekly' && (
          <select value={weeklyBatch} onChange={e => setWeeklyBatch(e.target.value)} className="ml-2 bg-stone-950 border border-amber-600/50 px-2 py-1.5 text-[10px] uppercase tracking-wider font-mono text-amber-300 focus:outline-none">
            {batchList.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        )}
        {/* LIVE IST CLOCK */}
        <div className="border border-emerald-700/40 bg-emerald-500/5 px-3 py-1.5 flex items-center gap-2">
          <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
          <span className="text-[10px] uppercase tracking-wider font-mono text-emerald-300">{currentTime} IST</span>
          <span className="text-[9px] text-stone-500 font-mono">· {parseInt(currentTime.split(':')[0]) >= 8 && parseInt(currentTime.split(':')[0]) < 16 ? `${currentTime.split(':')[0]}:00 slot LIVE` : 'off-hours'}</span>
        </div>
        {viewMode === 'daily' && (
          <div className="ml-auto flex gap-1 items-center flex-wrap">
            {days.map(d => {
              const isTodayTab = d === todayDayKey;
              const hasData = cellsByDay[d] && Object.keys(cellsByDay[d]).length > 0;
              return (
                <button key={d} onClick={() => handleDayTabClick(d)} className={`relative px-2.5 py-1.5 text-[10px] uppercase tracking-wider font-mono border transition-colors ${selectedDay === d ? 'border-amber-600/50 bg-amber-500/10 text-amber-300' : 'border-stone-800 text-stone-500 hover:text-stone-300'}`} title={isTodayTab ? `${d} (Today)` : d}>
                  {d}
                  {isTodayTab && <span className="absolute -top-1 -right-1 w-1.5 h-1.5 bg-emerald-400 rounded-full" title="Today" />}
                  {!hasData && <span className="ml-1 text-[8px] text-stone-700">empty</span>}
                </button>
              );
            })}
            {isManager && (
              <button onClick={() => { setCopyTargets({}); setShowCopyModal(true); }} className="ml-2 px-3 py-1.5 text-[10px] uppercase tracking-wider font-mono border border-sky-700/40 bg-sky-500/5 hover:bg-sky-500/10 text-sky-300 transition-colors flex items-center gap-1.5" title={`Copy ${selectedDay} timetable to other days`}>
                <Copy className="w-3 h-3" /> Copy {selectedDay} to...
              </button>
            )}
          </div>
        )}
      </div>

      {/* DAILY VIEW — time x batches */}
      {viewMode === 'daily' && (
        <div className="border border-stone-800 bg-stone-950/40 overflow-x-auto">
          <table className="w-full text-xs min-w-[700px]">
            <thead>
              <tr className="border-b border-stone-800">
                <th className="text-left px-3 py-3 text-[10px] uppercase tracking-wider text-stone-500 font-mono w-20">Time</th>
                {batchList.map(b => <th key={b} className="text-left px-3 py-3 text-[10px] uppercase tracking-wider text-stone-400 font-mono border-l border-stone-800">{b}<div className="text-[8px] text-stone-600 normal-case mt-0.5">{batchStrengthMap[b] || '—'} students</div></th>)}
              </tr>
            </thead>
            <tbody>
              {times.map(time => {
                const slotStatus = getSlotStatus(time, currentTime);
                const isCurrentRow = slotStatus === 'running';
                const slot = getSlot(time);
                // BREAK ROW — render full-width amber strip
                if (slot && slot.isBreak) {
                  return (
                    <tr key={time} className="border-b border-amber-700/30 bg-amber-500/[0.04]">
                      <td className="px-3 py-3 font-mono text-[11px] text-amber-400/80">
                        {time}
                        <div className="text-[8px] text-amber-500/60 mt-0.5">{slot.endTime}</div>
                      </td>
                      <td colSpan={batchList.length} className="border-l border-amber-700/30 px-4 py-3">
                        <div className="flex items-center justify-center gap-3">
                          <Coffee className="w-4 h-4 text-amber-400" strokeWidth={2} />
                          <span className="text-amber-300 text-sm tracking-wide" style={{fontFamily: 'Fraunces, serif'}}>{slot.label}</span>
                          <span className="text-amber-500/60 text-[10px] font-mono uppercase tracking-wider">{slot.startTime} → {slot.endTime}</span>
                        </div>
                      </td>
                    </tr>
                  );
                }
                return (
                <tr key={time} className={`border-b border-stone-800/60 ${isCurrentRow ? 'bg-emerald-500/[0.03]' : ''}`}>
                  <td className={`px-3 py-2 font-mono text-[11px] ${isCurrentRow ? 'text-emerald-300' : slotStatus === 'completed' ? 'text-stone-600' : 'text-stone-500'}`}>
                    {time}
                    {slot && <div className="text-[8px] text-stone-600 mt-0.5">{slot.endTime}</div>}
                    {isCurrentRow && <div className="flex items-center gap-1 mt-0.5">
                      <span className="w-1 h-1 bg-emerald-400 rounded-full animate-pulse" />
                      <span className="text-[8px] uppercase tracking-wider text-emerald-400">LIVE</span>
                    </div>}
                  </td>
                  {batchList.map(b => {
                    const key = `${time}-${b}`;
                    const cell = cells[key];
                    const isLiveCell = isCurrentRow && cell; // class is happening RIGHT NOW based on IST
                    if (!cell) return (
                      <td key={b} className="border-l border-stone-800/60 px-2 py-2">
                        <div onClick={() => openAssign(key)} className={`h-12 border border-dashed border-stone-800/60 transition-all flex items-center justify-center text-[9px] text-stone-700 font-mono ${isManager ? 'hover:border-amber-600/60 hover:bg-amber-500/5 hover:text-amber-400 cursor-pointer' : 'hover:border-stone-700'}`}>
                          {isManager ? '+ Assign' : '+'}
                        </div>
                      </td>
                    );
                    const cls = colorMap[cell.subj] || 'border-stone-700 text-stone-300';
                    const isInConflict = conflictingCells.has(key);
                    return (
                      <td key={b} className="border-l border-stone-800/60 px-2 py-2">
                        <div onClick={() => openAssign(key)} className={`border ${cls} bg-stone-950/80 px-2 py-2 hover:bg-stone-900 cursor-pointer transition-all relative ${isInConflict ? 'ring-2 ring-red-500/70 shadow-[0_0_12px_rgba(239,68,68,0.3)]' : isLiveCell ? 'ring-2 ring-emerald-500/60 shadow-[0_0_10px_rgba(16,185,129,0.25)]' : ''} ${isManager && !isInConflict ? 'hover:ring-1 hover:ring-amber-500/40' : ''}`}>
                          {isInConflict && (
                            <div className="absolute top-1 right-1 flex items-center gap-0.5 bg-red-500/90 px-1 py-0.5">
                              <AlertTriangle className="w-2.5 h-2.5 text-white" strokeWidth={2.5} />
                            </div>
                          )}
                          {isLiveCell && !isInConflict && <div className="absolute top-1 right-1 w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />}
                          <div className="flex items-center gap-1 mb-0.5">
                            <MapPin className="w-2.5 h-2.5 text-amber-400/70" strokeWidth={2} />
                            <span className="text-[9px] text-amber-300/90 font-mono font-medium tracking-wider">{cell.room || '—'}</span>
                          </div>
                          <div className={`text-xs ${cls.split(' ')[1]}`} style={{fontFamily: 'Fraunces, serif'}}>{cell.subj}</div>
                          <div className={`text-[9px] font-mono mt-0.5 ${isInConflict ? 'text-red-300' : slotStatus === 'completed' ? 'text-stone-600' : 'text-stone-500'}`}>{cell.tch}</div>
                        </div>
                      </td>
                    );
                  })}
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* WEEKLY VIEW — time x days for selected batch */}
      {viewMode === 'weekly' && (
        <>
          <div className="text-[10px] uppercase tracking-[0.2em] text-stone-500 font-mono">Showing full week for <span className="text-amber-300">{weeklyBatch}</span> · 26 May - 31 May 2026</div>
          <div className="border border-stone-800 bg-stone-950/40 overflow-x-auto">
            <table className="w-full text-xs min-w-[700px]">
              <thead>
                <tr className="border-b border-stone-800">
                  <th className="text-left px-3 py-3 text-[10px] uppercase tracking-wider text-stone-500 font-mono w-20">Time</th>
                  {days.map(d => <th key={d} className="text-left px-3 py-3 text-[10px] uppercase tracking-wider text-stone-400 font-mono border-l border-stone-800">{d}</th>)}
                </tr>
              </thead>
              <tbody>
                {times.map(time => (
                  <tr key={time} className="border-b border-stone-800/60">
                    <td className="px-3 py-2 font-mono text-[11px] text-stone-500">{time}</td>
                    {days.map((d, dayIdx) => {
                      // Get cell from the day's actual data
                      const dayCells = cellsByDay[d] || {};
                      const cell = dayCells[`${time}-${weeklyBatch}`];
                      if (!cell) return (
                        <td key={d} className="border-l border-stone-800/60 px-2 py-2">
                          <div className="h-12 border border-dashed border-stone-800/60 flex items-center justify-center text-[9px] text-stone-700 font-mono">—</div>
                        </td>
                      );
                      const cls = colorMap[cell.subj] || 'border-stone-700 text-stone-300';
                      return (
                        <td key={d} className="border-l border-stone-800/60 px-2 py-2">
                          <div className={`border ${cls} bg-stone-950/80 px-2 py-2 relative`}>
                            <div className="flex items-center gap-1 mb-0.5">
                              <MapPin className="w-2.5 h-2.5 text-amber-400/70" strokeWidth={2} />
                              <span className="text-[9px] text-amber-300/90 font-mono tracking-wider">{cell.room}</span>
                            </div>
                            <div className={`text-xs ${cls.split(' ')[1]}`} style={{fontFamily: 'Fraunces, serif'}}>{cell.subj}</div>
                            <div className="text-[9px] text-stone-500 font-mono mt-0.5">{cell.tch}</div>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="text-[10px] text-stone-500 italic" style={{fontFamily: 'Fraunces, serif'}}>
            — Switch batch from dropdown above to see different batches' weekly schedule.
          </div>
        </>
      )}

      {/* BY TEACHER VIEW — time x teachers */}
      {viewMode === 'byTeacher' && (() => {
        const usedTeachers = [...new Set(Object.values(cells).map(c => c.tch))].sort();
        const findByTeacher = (time, teacher) => {
          const found = Object.entries(cells).find(([key, c]) => key.startsWith(time + '-') && c.tch === teacher);
          if (!found) return null;
          return { ...found[1], batch: found[0].slice(time.length + 1) };
        };
        return (
          <>
            <div className="text-[10px] uppercase tracking-[0.2em] text-stone-500 font-mono">Teacher-wise schedule · {usedTeachers.length} teachers active today · empty cell = free slot</div>
            <div className="border border-stone-800 bg-stone-950/40 overflow-x-auto">
              <table className="w-full text-xs min-w-[900px]">
                <thead>
                  <tr className="border-b border-stone-800">
                    <th className="text-left px-3 py-3 text-[10px] uppercase tracking-wider text-stone-500 font-mono w-20 sticky left-0 bg-stone-950">Time</th>
                    {usedTeachers.map(t => <th key={t} className="text-left px-3 py-3 text-[10px] uppercase tracking-wider text-stone-400 font-mono border-l border-stone-800 min-w-[100px]">{t}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {times.map(time => (
                    <tr key={time} className="border-b border-stone-800/60">
                      <td className="px-3 py-2 font-mono text-[11px] text-stone-500 sticky left-0 bg-stone-950">{time}</td>
                      {usedTeachers.map(t => {
                        const cell = findByTeacher(time, t);
                        if (!cell) return (
                          <td key={t} className="border-l border-stone-800/60 px-2 py-2">
                            <div className="h-12 border border-dashed border-emerald-700/20 bg-emerald-500/[0.02] flex items-center justify-center text-[9px] text-emerald-700 font-mono">free</div>
                          </td>
                        );
                        const cls = colorMap[cell.subj] || 'border-stone-700 text-stone-300';
                        return (
                          <td key={t} className="border-l border-stone-800/60 px-2 py-2">
                            <div className={`border ${cls} bg-stone-950/80 px-2 py-2`}>
                              <div className="flex items-center gap-1 mb-0.5">
                                <MapPin className="w-2.5 h-2.5 text-amber-400/70" strokeWidth={2} />
                                <span className="text-[9px] text-amber-300/90 font-mono tracking-wider">{cell.room}</span>
                              </div>
                              <div className={`text-xs ${cls.split(' ')[1]}`} style={{fontFamily: 'Fraunces, serif'}}>{cell.subj}</div>
                              <div className="text-[9px] text-stone-500 font-mono mt-0.5">{cell.batch}</div>
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="text-[10px] text-stone-500 italic" style={{fontFamily: 'Fraunces, serif'}}>
              — Scroll right to see all teachers. Green "free" cells = teacher available, can be assigned a substitute.
            </div>
          </>
        );
      })()}

      {/* BY ROOM VIEW — time x rooms */}
      {viewMode === 'byRoom' && (() => {
        const usedRooms = [...new Set(Object.values(cells).map(c => c.room).filter(Boolean))].sort();
        const findByRoom = (time, room) => {
          const found = Object.entries(cells).find(([key, c]) => key.startsWith(time + '-') && c.room === room);
          if (!found) return null;
          return { ...found[1], batch: found[0].slice(time.length + 1) };
        };
        return (
          <>
            <div className="text-[10px] uppercase tracking-[0.2em] text-stone-500 font-mono">Room-wise occupancy · {usedRooms.length} rooms in use · empty cell = room available</div>
            <div className="border border-stone-800 bg-stone-950/40 overflow-x-auto">
              <table className="w-full text-xs min-w-[800px]">
                <thead>
                  <tr className="border-b border-stone-800">
                    <th className="text-left px-3 py-3 text-[10px] uppercase tracking-wider text-stone-500 font-mono w-20 sticky left-0 bg-stone-950">Time</th>
                    {usedRooms.map(r => (
                      <th key={r} className="text-left px-3 py-3 text-[10px] uppercase tracking-wider font-mono border-l border-stone-800 min-w-[110px]">
                        <div className="flex items-center gap-1 text-amber-300/80">
                          <MapPin className="w-3 h-3" strokeWidth={2} />
                          {r}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {times.map(time => (
                    <tr key={time} className="border-b border-stone-800/60">
                      <td className="px-3 py-2 font-mono text-[11px] text-stone-500 sticky left-0 bg-stone-950">{time}</td>
                      {usedRooms.map(r => {
                        const cell = findByRoom(time, r);
                        if (!cell) return (
                          <td key={r} className="border-l border-stone-800/60 px-2 py-2">
                            <div className="h-12 border border-dashed border-emerald-700/20 bg-emerald-500/[0.02] flex items-center justify-center text-[9px] text-emerald-700 font-mono">empty</div>
                          </td>
                        );
                        const cls = colorMap[cell.subj] || 'border-stone-700 text-stone-300';
                        return (
                          <td key={r} className="border-l border-stone-800/60 px-2 py-2">
                            <div className={`border ${cls} bg-stone-950/80 px-2 py-2`}>
                              <div className="text-[10px] text-stone-200 mb-0.5" style={{fontFamily: 'Fraunces, serif'}}>{cell.batch}</div>
                              <div className={`text-xs ${cls.split(' ')[1]}`} style={{fontFamily: 'Fraunces, serif'}}>{cell.subj}</div>
                              <div className="text-[9px] text-stone-500 font-mono mt-0.5">{cell.tch}</div>
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="text-[10px] text-stone-500 italic" style={{fontFamily: 'Fraunces, serif'}}>
              — Green "empty" cells = room free at that time, can be used for extra classes or substitutes.
            </div>
          </>
        );
      })()}

      {assignSlot && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur z-50 flex items-center justify-center p-4" onClick={() => setAssignSlot(null)}>
          <div className="w-full max-w-md bg-stone-950 border border-amber-700/40 p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <div>
                <div className="text-[10px] uppercase tracking-[0.25em] text-amber-500/70 font-mono">Assign Class</div>
                <h3 className="text-xl text-stone-100 font-light mt-1" style={{fontFamily: 'Fraunces, serif'}}>{assignSlot.split('-').slice(1).join('-')}</h3>
                <div className="text-stone-500 text-[11px] font-mono mt-0.5">{assignSlot.split('-')[0]} · {selectedDay}</div>
              </div>
              <button onClick={() => setAssignSlot(null)} className="text-stone-500 hover:text-stone-300">
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div>
              <div className="text-[10px] uppercase tracking-wider text-stone-500 font-mono mb-2 flex items-center justify-between">
                <span>Teacher <span className="text-stone-600 normal-case tracking-normal text-[9px]">· {teacherShortNames.length} available</span></span>
                {pickSubject && (teachersBySubject[pickSubject] || []).length > 0 && (
                  <span className="text-amber-400/70 normal-case tracking-normal text-[9px]">
                    {(teachersBySubject[pickSubject] || []).length} teach {pickSubject}
                  </span>
                )}
              </div>
              <select value={pickTeacher} onChange={e => onTeacherChange(e.target.value)} className="w-full bg-stone-900 border border-stone-800 px-3 py-2.5 text-stone-200 text-sm focus:border-amber-600/40 focus:outline-none">
                {teacherShortNames.length === 0 ? (
                  <option value="">— No teachers found · Add karo Faculty mein —</option>
                ) : pickSubject && (teachersBySubject[pickSubject] || []).length > 0 ? (
                  <>
                    {/* PRIMARY: teachers who teach selected subject (shown first) */}
                    <optgroup label={`★ Teachers who teach ${pickSubject}`}>
                      {(teachersBySubject[pickSubject] || []).sort().map(t => (
                        <option key={t} value={t}>{t} Sir · {teacherSubjectMap[t] || '—'}</option>
                      ))}
                    </optgroup>
                    {/* SECONDARY: all other teachers (for special assignments) */}
                    <optgroup label="All other teachers">
                      {teacherShortNames.filter(t => !(teachersBySubject[pickSubject] || []).includes(t)).map(t => (
                        <option key={t} value={t}>{t} Sir · {teacherSubjectMap[t] || '—'}</option>
                      ))}
                    </optgroup>
                  </>
                ) : (
                  <>
                    {/* No subject selected OR no teacher matches — show ALL teachers */}
                    {teacherShortNames.map(t => (
                      <option key={t} value={t}>{t} Sir · {teacherSubjectMap[t] || '—'}</option>
                    ))}
                  </>
                )}
              </select>
              {pickTeacher && (
                <div className="text-[10px] text-stone-500 mt-1.5 italic flex items-center gap-1.5">
                  <CheckCircle2 className="w-3 h-3 text-amber-400/70 shrink-0" />
                  <span><span className="text-stone-300">{pickTeacher} Sir</span> · primary subject: <span className="text-amber-300 not-italic font-medium">{teacherSubjectMap[pickTeacher] || '—'}</span></span>
                </div>
              )}
            </div>

            <div>
              <div className="text-[10px] uppercase tracking-wider text-stone-500 font-mono mb-2 flex items-center justify-between">
                <span>Subject <span className="text-stone-600 normal-case tracking-normal text-[9px]">· optional</span></span>
                {pickSubject && (
                  <button onClick={() => setPickSubject('')} className="text-stone-500 hover:text-stone-300 normal-case text-[9px] tracking-normal flex items-center gap-1">
                    <XCircle className="w-2.5 h-2.5" /> Clear
                  </button>
                )}
              </div>
              <div className="grid grid-cols-4 gap-2">
                {subjectOptions.map(s => {
                  const teacherCount = (teachersBySubject[s] || []).length;
                  return (
                    <button key={s} onClick={() => onSubjectChange(s)} className={`px-2 py-2 text-[11px] border transition-colors relative ${pickSubject === s ? `${colorMap[s]} bg-stone-900` : 'border-stone-800 text-stone-400 hover:border-stone-700'}`} style={{fontFamily: 'Fraunces, serif'}}>
                      {s}
                      {teacherCount > 0 && (
                        <span className="absolute top-0.5 right-1 text-[8px] font-mono text-stone-500">{teacherCount}</span>
                      )}
                    </button>
                  );
                })}
              </div>
              {pickSubject && teacherSubjectMap[pickTeacher] && teacherSubjectMap[pickTeacher] !== pickSubject && (
                <div className="text-[10px] text-amber-400/80 mt-1.5 italic flex items-center gap-1.5">
                  <AlertCircle className="w-3 h-3 shrink-0" />
                  Note: {pickTeacher} Sir's primary subject is {teacherSubjectMap[pickTeacher]} (not {pickSubject}). Special class?
                </div>
              )}
            </div>

            <div>
              <div className="text-[10px] uppercase tracking-wider text-stone-500 font-mono mb-2 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <MapPin className="w-3 h-3 text-amber-400/70" strokeWidth={2} /> Classroom
                </span>
                {roomCapacityMap[pickRoom] && (
                  <span className="text-stone-400 normal-case tracking-normal flex items-center gap-1">
                    <Users className="w-3 h-3 text-amber-400/70" />
                    <span className="text-amber-300 font-mono">{roomCapacityMap[pickRoom]}</span>
                    <span>seats</span>
                  </span>
                )}
              </div>
              <div className="grid grid-cols-5 gap-1.5 mb-2">
                {roomOptions.map(r => (
                  <button key={r} onClick={() => setPickRoom(r)} title={`Capacity: ${roomCapacityMap[r] || '—'} students`} className={`px-1.5 py-2 text-[10px] border transition-colors font-mono ${pickRoom === r ? 'border-amber-600/50 bg-amber-500/10 text-amber-300' : 'border-stone-800 text-stone-400 hover:border-stone-700 hover:text-stone-300'}`}>
                    {r}
                  </button>
                ))}
              </div>
              <input value={pickRoom} onChange={e => setPickRoom(e.target.value.toUpperCase())} placeholder="Or type custom room name..." className="w-full bg-stone-900 border border-stone-800 px-3 py-2 text-stone-200 text-xs font-mono focus:border-amber-600/40 focus:outline-none" />
              <div className="text-[10px] text-stone-600 mt-1 italic">
                Manager Faculty → Classrooms tab se naye rooms add kar sakta hai · capacity ke saath
              </div>
            </div>

            {/* CAPACITY CHECK — warn if batch students > room capacity */}
            {(() => {
              const slotBatch = assignSlot ? assignSlot.slice(assignSlot.split('-')[0].length + 1) : null;
              const batchStrength = batchStrengthMap[slotBatch];
              const roomCap = roomCapacityMap[pickRoom];
              const overflow = batchStrength && roomCap && batchStrength > roomCap;
              if (overflow) {
                return (
                  <div className="border border-amber-700/50 bg-amber-500/10 p-3 flex items-start gap-2">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400 mt-0.5 shrink-0" />
                    <div className="text-[11px] text-stone-200">
                      <span className="text-amber-300 font-medium">Capacity issue:</span> {slotBatch} batch mein <span className="text-amber-300">{batchStrength} students</span> hain, par room <span className="font-mono">{pickRoom}</span> ki capacity sirf <span className="text-amber-300">{roomCap}</span> hai. Bigger room choose karo ya batch split karo.
                    </div>
                  </div>
                );
              }
              return null;
            })()}

            {hasConflict ? (
              <div className="border border-red-700/60 bg-red-500/10 p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 animate-pulse" />
                  <div className="text-red-300 text-xs font-medium uppercase tracking-wider font-mono">⚠ Conflict Detected</div>
                </div>
                {teacherClash && (
                  <div className="text-[11px] text-stone-200 pl-6 leading-relaxed">
                    <span className="text-red-300 font-medium">Teacher busy:</span> <span className="text-stone-100">{pickTeacher} Sir</span> is already teaching <span className="text-amber-300">{teacherClash.subj}</span> to <span className="text-amber-300">{teacherClash.batch}</span> in room <span className="text-amber-300 font-mono">{teacherClash.room}</span> at this same time.
                  </div>
                )}
                {roomClash && (
                  <div className="text-[11px] text-stone-200 pl-6 leading-relaxed">
                    <span className="text-red-300 font-medium">Room booked:</span> <span className="text-amber-300 font-mono">{pickRoom}</span> is already occupied by <span className="text-amber-300">{roomClash.batch}</span> ({roomClash.subj} · {roomClash.tch} Sir) at this same time.
                  </div>
                )}
                <div className="text-[10px] text-stone-400 pl-6 italic pt-1 border-t border-red-900/30 mt-2">
                  💡 Tip: Change teacher or room above to fix. Or click "Save Anyway" if you have a valid reason.
                </div>
              </div>
            ) : (
              <div className="border border-emerald-700/30 bg-emerald-500/5 p-3 flex items-start gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" />
                <div className="text-[11px] text-stone-300">
                  <span className="text-emerald-300">No conflicts detected</span> — {pickTeacher} Sir is free at {assignSlot.split('-')[0]} on {selectedDay}. Room <span className="text-amber-300 font-mono">{pickRoom}</span> is available.
                </div>
              </div>
            )}

            <div className="flex gap-2 pt-2">
              {cells[assignSlot] && (
                <button onClick={clearSlot} className="px-3 py-2 text-[10px] uppercase tracking-wider font-mono border border-red-700/40 text-red-400 hover:bg-red-500/5">
                  Remove
                </button>
              )}
              <button onClick={() => setAssignSlot(null)} className="px-3 py-2 text-[10px] uppercase tracking-wider font-mono border border-stone-700 text-stone-400">Cancel</button>
              <button onClick={saveAssign} className={`ml-auto px-4 py-2 text-[10px] uppercase tracking-wider font-mono border flex items-center gap-2 transition-colors ${hasConflict ? 'border-red-600/60 bg-red-500/10 text-red-300 hover:bg-red-500/20' : 'border-amber-600/50 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20'}`}>
                {hasConflict ? <AlertTriangle className="w-3 h-3" /> : <CheckCircle2 className="w-3 h-3" />}
                {hasConflict ? 'Save Anyway' : (cells[assignSlot] ? 'Update' : 'Assign')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* COPY DAY MODAL — Manager only */}
      {showCopyModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur z-50 flex items-center justify-center p-4" onClick={() => !copyInProgress && setShowCopyModal(false)}>
          <div className="w-full max-w-md bg-stone-950 border border-sky-700/40 p-6 space-y-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <div>
                <div className="text-[10px] uppercase tracking-[0.25em] text-sky-400/70 font-mono">Apply Schedule</div>
                <h3 className="text-xl text-stone-100 font-light mt-1" style={{fontFamily: 'Fraunces, serif'}}>Copy <span className="italic text-sky-300">{selectedDay}</span> to other days</h3>
                <div className="text-stone-500 text-[11px] font-mono mt-1">{Object.keys(cells).length} classes will be copied per day</div>
              </div>
              <button onClick={() => !copyInProgress && setShowCopyModal(false)} className="text-stone-500 hover:text-stone-300">
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div className="border border-amber-700/30 bg-amber-500/5 p-3 text-[11px] text-amber-200/80 leading-relaxed">
              <strong className="text-amber-300">⚠️ Warning:</strong> Target days ke existing classes <strong>replace</strong> ho jayengi. {selectedDay} ke saare classes target days mein copy honge.
            </div>

            <div>
              <div className="text-[10px] uppercase tracking-wider text-stone-500 font-mono mb-2">Select target days</div>
              <div className="grid grid-cols-3 gap-2">
                {days.filter(d => d !== selectedDay).map(d => (
                  <label key={d} className={`flex items-center gap-2 px-3 py-2 border cursor-pointer transition-colors ${copyTargets[d] ? 'border-sky-600/50 bg-sky-500/10' : 'border-stone-800 hover:border-stone-700'}`}>
                    <input type="checkbox" checked={!!copyTargets[d]} onChange={e => setCopyTargets({...copyTargets, [d]: e.target.checked})} className="accent-sky-500" />
                    <span className={`text-xs font-mono ${copyTargets[d] ? 'text-sky-300' : 'text-stone-400'}`}>{d}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <div className="text-[10px] uppercase tracking-wider text-stone-500 font-mono mb-2">Quick presets</div>
              <div className="flex gap-2 flex-wrap">
                <button onClick={() => { const t = {}; ['Mon','Tue','Wed','Thu','Fri'].forEach(d => { if (d !== selectedDay) t[d] = true; }); setCopyTargets(t); }} className="px-3 py-1.5 text-[10px] uppercase tracking-wider font-mono border border-stone-700 hover:border-sky-700/50 text-stone-400 hover:text-sky-300">Mon–Fri (weekdays)</button>
                <button onClick={() => { const t = {}; days.forEach(d => { if (d !== selectedDay) t[d] = true; }); setCopyTargets(t); }} className="px-3 py-1.5 text-[10px] uppercase tracking-wider font-mono border border-stone-700 hover:border-sky-700/50 text-stone-400 hover:text-sky-300">All week (Mon–Sat)</button>
                <button onClick={() => setCopyTargets({})} className="px-3 py-1.5 text-[10px] uppercase tracking-wider font-mono border border-stone-700 hover:border-red-700/50 text-stone-400 hover:text-red-300">Clear</button>
              </div>
            </div>

            <div className="flex gap-2 pt-2 border-t border-stone-800">
              <button onClick={() => setShowCopyModal(false)} disabled={copyInProgress} className="px-3 py-2 text-[10px] uppercase tracking-wider font-mono border border-stone-700 text-stone-400 hover:border-stone-600 disabled:opacity-50">Cancel</button>
              <button
                disabled={Object.keys(copyTargets).filter(k => copyTargets[k]).length === 0 || copyInProgress}
                onClick={async () => {
                  const targets = Object.keys(copyTargets).filter(k => copyTargets[k]);
                  if (targets.length === 0) return;
                  if (!confirm(`Copy ${selectedDay}'s schedule to ${targets.join(', ')}?\n\nTarget days ke existing classes overwrite ho jayengi.`)) return;
                  setCopyInProgress(true);
                  const result = await copyDayToDays(selectedDay, targets);
                  setCopyInProgress(false);
                  setShowCopyModal(false);
                  setSaveToast({
                    msg: `✓ Copied ${selectedDay} → ${targets.join(', ')} · ${result.copied} cells inserted${result.errors > 0 ? ` · ${result.errors} errors` : ''}`,
                    type: result.errors > 0 ? 'warning' : 'success',
                  });
                  setTimeout(() => setSaveToast(null), 5000);
                }}
                className="ml-auto px-4 py-2 text-[10px] uppercase tracking-wider font-mono border border-sky-600/50 bg-sky-500/10 text-sky-300 hover:bg-sky-500/20 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <Copy className="w-3 h-3" /> {copyInProgress ? 'Copying...' : `Copy to ${Object.keys(copyTargets).filter(k => copyTargets[k]).length || 0} day(s)`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ============ NEW: TOPIC TRACKING (Director) ============
const TopicTrackingView = () => {
  const [statusFilter, setStatusFilter] = useState('All');
  const [expanded, setExpanded] = useState(1);
  const filtered = CHAPTER_PROGRESS.filter(c => statusFilter === 'All' || c.status === statusFilter.toLowerCase().replace(' ', '_'));

  const counts = {
    completed: CHAPTER_PROGRESS.filter(c => c.status === 'completed').length,
    in_progress: CHAPTER_PROGRESS.filter(c => c.status === 'in_progress').length,
    behind: CHAPTER_PROGRESS.filter(c => c.status === 'behind').length,
  };

  return (
    <div className="space-y-6">
      <div className="border-b border-stone-800 pb-4">
        <div className="text-[10px] uppercase tracking-[0.25em] text-amber-500/70 font-mono mb-1">Module 08 · Syllabus Intelligence</div>
        <h1 className="text-3xl md:text-4xl font-light tracking-tight text-stone-50" style={{fontFamily: 'Fraunces, serif'}}>Topic <span className="italic text-amber-300/90">progress</span></h1>
        <p className="text-stone-500 text-sm mt-1">Class-wise: kis teacher ne kaun sa chapter kitne din mein cover kiya · live from teachers' daily logs</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-stone-800">
        <Stat label="Total Chapters" value={CHAPTER_PROGRESS.length} suffix="tracked" accent="text-stone-50" trend="Across 8 batches" />
        <Stat label="Completed" value={counts.completed} suffix="done" accent="text-emerald-400" trend="On schedule" />
        <Stat label="In Progress" value={counts.in_progress} suffix="ongoing" accent="text-amber-300" trend="Avg 75% complete" />
        <Stat label="Behind" value={counts.behind} suffix="lagging" accent="text-red-400" trend="Need extra classes" />
      </div>

      <div className="flex gap-2 flex-wrap items-center">
        <span className="text-[10px] uppercase tracking-wider text-stone-500 font-mono py-1.5">Filter:</span>
        {['All', 'Completed', 'In Progress', 'Behind'].map(s => (
          <button key={s} onClick={() => setStatusFilter(s)} className={`px-3 py-1.5 text-[10px] uppercase tracking-wider font-mono border transition-colors ${statusFilter === s ? 'border-amber-600/50 bg-amber-500/10 text-amber-300' : 'border-stone-800 text-stone-500 hover:text-stone-300'}`}>{s}</button>
        ))}
      </div>

      <div className="space-y-2">
        {filtered.map(c => {
          const dot = c.status === 'completed' ? 'bg-emerald-500' : c.status === 'behind' ? 'bg-red-500' : 'bg-amber-500';
          const pillVariant = c.status === 'completed' ? 'live' : c.status === 'behind' ? 'critical' : 'warning';
          const isExpanded = expanded === c.id;
          return (
            <div key={c.id} className="border border-stone-800 bg-stone-950/40 hover:bg-stone-900/40 transition-colors">
              <div className="flex items-stretch cursor-pointer" onClick={() => setExpanded(isExpanded ? null : c.id)}>
                <div className={`w-1 ${dot}`} />
                <div className="flex-1 p-4">
                  <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <Pill variant={pillVariant}>{c.status === 'in_progress' ? 'In Progress' : c.status === 'behind' ? 'Behind' : 'Completed'}</Pill>
                        <span className="text-[10px] uppercase tracking-wider text-stone-500 font-mono">{c.batch}</span>
                        <span className="text-stone-700">·</span>
                        <span className="text-[10px] uppercase tracking-wider text-stone-500 font-mono">{c.subject}</span>
                      </div>
                      <div className="text-stone-100 text-base md:text-lg mb-1" style={{fontFamily: 'Fraunces, serif'}}>{c.chapter}</div>
                      <div className="text-stone-500 text-xs">by <span className="text-amber-300/80">{c.teacher}</span> · Started {c.startDate} · Last taught {c.lastTaught}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className={`text-3xl font-light ${c.status === 'completed' ? 'text-emerald-300' : c.status === 'behind' ? 'text-red-400' : 'text-amber-300'}`} style={{fontFamily: 'Fraunces, serif'}}>{c.pct}<span className="text-sm text-stone-500">%</span></div>
                      <div className="text-[9px] uppercase tracking-wider text-stone-500 font-mono">{c.sessions} of {c.planned} sessions</div>
                    </div>
                  </div>

                  <div className="h-1.5 bg-stone-900 overflow-hidden">
                    <div className={`h-full ${c.status === 'completed' ? 'bg-emerald-500/60' : c.status === 'behind' ? 'bg-red-500/60' : 'bg-amber-500/60'}`} style={{width: `${c.pct}%`}} />
                  </div>
                </div>
              </div>

              {isExpanded && c.topics.length > 0 && (
                <div className="border-t border-stone-800 p-4 md:p-6 bg-stone-950/60">
                  <div className="text-[10px] uppercase tracking-[0.25em] text-stone-500 font-mono mb-3 flex items-center gap-2">
                    <BookMarked className="w-3 h-3" /> Topic-by-topic log
                  </div>
                  <div className="space-y-1.5">
                    {c.topics.map((t, i) => (
                      <div key={i} className="flex items-center gap-3 py-1.5 border-b border-stone-800/50 last:border-0">
                        <div className="w-5 h-5 border border-stone-700 flex items-center justify-center shrink-0">
                          {t.status === 'done' && <CheckCircle2 className="w-3 h-3 text-emerald-400" />}
                          {t.status === 'in_progress' && <Radio className="w-3 h-3 text-amber-400 animate-pulse" />}
                          {t.status === 'pending' && <span className="w-1.5 h-1.5 bg-stone-700" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className={`text-sm ${t.status === 'pending' ? 'text-stone-600' : 'text-stone-200'}`} style={{fontFamily: 'Fraunces, serif'}}>{t.name}</div>
                        </div>
                        <div className="text-[10px] font-mono text-stone-500 shrink-0">{t.date}</div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 flex items-center justify-between text-[10px] uppercase tracking-wider font-mono">
                    <div className="text-stone-500">Took <span className="text-amber-300">{c.sessions} sessions</span> · Started {c.startDate}</div>
                    <button onClick={() => alert(`📋 ${c.teacher}'s Teaching Log for ${c.batch} · ${c.subject}\n\n${c.topics.map((t, idx) => `${idx+1}. ${t.name} — ${t.date} ${t.status === 'done' ? '✓' : '⏳'}`).join('\n')}\n\n📊 ${c.sessions} sessions completed of ${c.planned} planned (${c.pct}%)`)} className="text-amber-400 hover:text-amber-300 flex items-center gap-1">View teacher log <ArrowRight className="w-3 h-3" /></button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="border border-amber-700/40 bg-amber-500/5 p-4 flex items-start gap-3">
        <Target className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
        <div className="text-xs text-stone-400">
          <div className="text-amber-300 mb-1">Insight</div>
          <div>2 batches are behind schedule. <span className="text-stone-200">NDA 16 March (Climatology)</span> and <span className="text-stone-200">12th B (Directive Principles)</span> need extra classes. Click each to see topic-by-topic breakdown.</div>
        </div>
      </div>
    </div>
  );
};

const ImportView = ({ onGoToConflicts }) => {
  const [stage, setStage] = useState('idle');
  return (
    <div className="space-y-6">
      <div className="border-b border-stone-800 pb-4">
        <div className="text-[10px] uppercase tracking-[0.25em] text-amber-500/70 font-mono mb-1">Module 11 · Data Import</div>
        <h1 className="text-3xl md:text-4xl font-light tracking-tight text-stone-50" style={{fontFamily: 'Fraunces, serif'}}>Excel <span className="italic text-amber-300/90">bulk import</span></h1>
        <p className="text-stone-500 text-sm mt-1">Upload your existing timetable spreadsheet — system parses & loads automatically.</p>
      </div>

      {stage === 'idle' && (
        <>
          <div className="border-2 border-dashed border-stone-800 hover:border-amber-600/40 bg-stone-950/40 p-8 md:p-12 text-center transition-colors cursor-pointer group" onClick={() => setStage('uploaded')}>
            <Upload className="w-10 h-10 text-stone-600 group-hover:text-amber-400 mx-auto mb-4 transition-colors" strokeWidth={1.5} />
            <div className="text-stone-200 text-lg font-light mb-1" style={{fontFamily: 'Fraunces, serif'}}>Drop your Excel file here</div>
            <div className="text-stone-500 text-xs mb-4">or click to browse · .xlsx, .xls, .csv</div>
            <button className="border border-amber-600/40 bg-amber-500/5 hover:bg-amber-500/10 px-5 py-2 text-xs uppercase tracking-wider text-amber-300 font-mono">Select File</button>
          </div>

          <div className="border border-stone-800 bg-stone-950/40 p-5">
            <div className="text-[10px] uppercase tracking-[0.25em] text-stone-500 font-mono mb-3">Required columns</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px]">
              {['Teacher Name', 'Subject', 'Wing', 'Batch', 'Start Time', 'End Time', 'Room', 'Days'].map(c => (
                <div key={c} className="border-l-2 border-amber-600/40 pl-2 py-1 text-stone-300 font-mono">{c}</div>
              ))}
            </div>
            <div className="text-[10px] text-stone-500 mt-3 italic" style={{fontFamily: 'Fraunces, serif'}}>
              Don't have a template? <span className="text-amber-400 cursor-pointer hover:underline">Download starter →</span>
            </div>
          </div>
        </>
      )}

      {stage === 'uploaded' && (
        <div className="space-y-4">
          <div className="border border-emerald-700/40 bg-emerald-500/5 p-5 flex items-center gap-4 flex-wrap">
            <FileSpreadsheet className="w-8 h-8 text-emerald-400 shrink-0" strokeWidth={1.5} />
            <div className="flex-1 min-w-0">
              <div className="text-stone-100 text-sm truncate">Dreamers_Timetable_Analysis.xlsx</div>
              <div className="text-stone-500 text-[10px] font-mono mt-0.5">5 sheets · 167 schedule rows · 33 teachers detected</div>
            </div>
            <Pill variant="live">Parsed</Pill>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-stone-800">
            <Stat label="Teachers" value="33" suffix="rows" />
            <Stat label="Schedule Rows" value="167" suffix="slots" accent="text-amber-300" />
            <Stat label="Batches" value="48" suffix="unique" accent="text-sky-300" />
            <Stat label="Conflicts" value="19" suffix="issues" accent="text-red-400" />
          </div>

          <div className="border border-stone-800 bg-stone-950/40 p-5">
            <div className="text-[10px] uppercase tracking-[0.25em] text-stone-500 font-mono mb-3">Preview — first 5 rows</div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs min-w-[600px]">
                <thead>
                  <tr className="border-b border-stone-800 text-[10px] uppercase tracking-wider text-stone-500 font-mono">
                    <th className="text-left py-2 px-2">Teacher</th><th className="text-left py-2 px-2">Subject</th>
                    <th className="text-left py-2 px-2">Batch</th><th className="text-left py-2 px-2">Time</th>
                    <th className="text-left py-2 px-2">Wing</th><th className="text-left py-2 px-2">Status</th>
                  </tr>
                </thead>
                <tbody className="text-stone-300">
                  {[
                    {t:'Aatir Tyagi Sir',s:'Physics',b:'11th A',ti:'09:00-10:00',w:'Senior',ok:true},
                    {t:'Aatir Tyagi Sir',s:'Physics',b:'11th B',ti:'10:30-11:30',w:'Senior',ok:true},
                    {t:'Ankita Bisht',s:'English',b:'Class 5',ti:'08:30-09:15',w:'Junior',ok:true},
                    {t:'Anil Rawat Sir',s:'Maths',b:'Class 9',ti:'10:00-10:45',w:'Junior',ok:true},
                    {t:'Ranjan Sir',s:'NDA Maths',b:'JEE Regular',ti:'18:00-17:00',w:'Senior',ok:false},
                  ].map((r,i)=>(
                    <tr key={i} className="border-b border-stone-800/50">
                      <td className="py-2 px-2">{r.t}</td>
                      <td className="py-2 px-2 text-stone-400">{r.s}</td>
                      <td className="py-2 px-2 text-stone-400">{r.b}</td>
                      <td className="py-2 px-2 font-mono">{r.ti}</td>
                      <td className="py-2 px-2 text-stone-500 text-[10px] uppercase tracking-wider font-mono">{r.w}</td>
                      <td className="py-2 px-2">{r.ok ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <AlertTriangle className="w-3.5 h-3.5 text-red-400" />}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3 text-[10px] text-amber-400 italic" style={{fontFamily: 'Fraunces, serif'}}>
              ⚠ Row 5 — Ranjan Sir's end time (17:00) is before start (18:00). Will be flagged after import.
            </div>
          </div>

          <div className="flex gap-2 flex-wrap">
            <button onClick={() => setStage('idle')} className="px-4 py-2 text-xs uppercase tracking-wider font-mono border border-stone-700 text-stone-400">Cancel</button>
            <button onClick={() => setStage('success')} className="px-4 py-2 text-xs uppercase tracking-wider font-mono border border-amber-600/50 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 ml-auto">
              Confirm &amp; Import 167 Rows →
            </button>
          </div>
        </div>
      )}

      {stage === 'success' && (
        <div className="border border-emerald-700/40 bg-emerald-500/5 p-8 text-center">
          <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-4" strokeWidth={1.5} />
          <h3 className="text-2xl text-stone-100 font-light mb-1" style={{fontFamily: 'Fraunces, serif'}}>Import complete</h3>
          <p className="text-stone-400 text-sm mb-6">167 entries loaded · 33 teachers · 48 batches · 19 conflicts queued</p>
          <div className="flex gap-2 justify-center flex-wrap">
            <button onClick={() => setStage('idle')} className="px-4 py-2 text-xs uppercase tracking-wider font-mono border border-stone-700 text-stone-300">Import Another</button>
            <button onClick={onGoToConflicts} className="px-4 py-2 text-xs uppercase tracking-wider font-mono border border-emerald-600/50 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 transition-colors">Review Conflicts →</button>
          </div>
        </div>
      )}
    </div>
  );
};

// ============ DIRECTOR PORTAL ============
const DirectorPortal = ({ onLogout, role = 'director', loggedInUser = null, photos = {}, notifications = [], addNotification = () => {}, markAllRead = () => {}, clearNotifications = () => {}, conflicts = CONFLICTS, setConflicts = () => {}, cells = {}, cellsByDay = {}, todayDayKey = 'Mon', copyDayToDays = async () => {}, setCells = () => {}, saveCellToDB = async () => {}, teachers = [], setTeachers = () => {}, addTeacherToDB = async () => {}, updateTeacherInDB = async () => {}, deleteTeacherFromDB = async () => {}, classrooms = [], setClassrooms = () => {}, addRoomToDB = async () => {}, updateRoomInDB = async () => {}, deleteRoomFromDB = async () => {}, batches = [], setBatches = () => {}, addBatchToDB = async () => {}, updateBatchInDB = async () => {}, deleteBatchFromDB = async () => {}, timeSlots = [], addTimeSlotToDB = async () => {}, updateTimeSlotInDB = async () => {}, deleteTimeSlotFromDB = async () => {}, currentTime = '08:00' }) => {
  const isManager = role === 'manager';
  const [activeView, setActiveView] = useState(isManager ? 'timetable' : 'command');
  const [notifPanelOpen, setNotifPanelOpen] = useState(false);
  const unreadCount = notifications.filter(n => !n.read).length;
  const nav = [
    { id: 'command', label: 'Command Center', icon: Activity },
    { id: 'timetable', label: 'Timetable', icon: Calendar },
    { id: 'teachers', label: 'Faculty', icon: Users },
    { id: 'topics', label: 'Topic Tracking', icon: BookMarked },
    { id: 'free', label: 'Free Now', icon: Coffee },
    { id: 'conflicts', label: 'Conflicts', icon: AlertTriangle },
    { id: 'analytics', label: 'Analytics', icon: TrendingUp },
    { id: 'import', label: 'Import Data', icon: Upload },
  ];

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100" style={{fontFamily: '"Fraunces", "Inter", system-ui, sans-serif'}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,300;9..144,400;9..144,500&family=JetBrains+Mono:wght@400;500&display=swap');
        .font-mono, [class*="font-mono"] { font-family: 'JetBrains Mono', monospace; }
      `}</style>

      <div className="flex min-h-screen">
        <aside className="w-60 border-r border-stone-800 bg-stone-950 flex-col shrink-0 hidden md:flex">
          <div className="p-6 border-b border-stone-800">
            <div className="text-[9px] uppercase tracking-[0.3em] text-amber-500/60 font-mono mb-1">Doon Defence</div>
            <div className="text-2xl tracking-tight text-stone-50" style={{fontFamily: 'Fraunces, serif', fontWeight: 400}}>Dreamers</div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-stone-500 font-mono mt-0.5">Command Center</div>
          </div>

          <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
            <div className="text-[9px] uppercase tracking-[0.25em] text-stone-600 font-mono px-3 py-2">Navigation</div>
            {nav.map(item => {
              const Icon = item.icon;
              const active = activeView === item.id;
              return (
                <button key={item.id} onClick={() => setActiveView(item.id)} className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm transition-all ${active ? 'bg-amber-500/10 text-amber-300 border-l-2 border-amber-500' : 'text-stone-400 hover:text-stone-100 hover:bg-stone-900 border-l-2 border-transparent'}`}>
                  <Icon className="w-4 h-4" strokeWidth={1.5} />
                  <span>{item.label}</span>
                  {active && <span className="ml-auto w-1 h-1 bg-amber-400 rounded-full" />}
                </button>
              );
            })}
          </nav>

          <div className="p-4 border-t border-stone-800">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 border border-amber-700/40 bg-amber-500/10 flex items-center justify-center text-amber-300" style={{fontFamily: 'Fraunces, serif'}}>{isManager ? 'M' : 'D'}</div>
              <div className="flex-1 min-w-0">
                <div className="text-xs text-stone-200 truncate">{isManager ? 'Schedule Manager' : 'Director'}</div>
                <div className="text-[10px] uppercase tracking-wider text-stone-500 font-mono">{isManager ? 'Full Access' : 'Super Admin'}</div>
              </div>
              <button onClick={() => setNotifPanelOpen(true)} className="relative text-stone-500 hover:text-amber-300 transition-colors p-1" title="Notifications">
                <Bell className="w-4 h-4" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[9px] font-mono font-bold rounded-full flex items-center justify-center animate-pulse">{unreadCount > 9 ? '9+' : unreadCount}</span>
                )}
              </button>
            </div>
            <button onClick={onLogout} className="w-full text-[10px] uppercase tracking-wider font-mono text-stone-500 hover:text-amber-400 flex items-center gap-2 px-3 py-2 border border-stone-800 hover:border-stone-700">
              <LogOut className="w-3 h-3" /> Logout
            </button>
          </div>
        </aside>

        <main className="flex-1 overflow-x-hidden min-w-0">
          <div className="md:hidden border-b border-stone-800 bg-stone-950 sticky top-0 z-20">
            <div className="px-4 py-3 flex items-center justify-between">
              <div>
                <div className="text-[9px] uppercase tracking-[0.3em] text-amber-500/60 font-mono">Doon Defence</div>
                <div className="text-lg tracking-tight text-stone-50" style={{fontFamily: 'Fraunces, serif'}}>Dreamers</div>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={() => setNotifPanelOpen(true)} className="relative text-stone-500 hover:text-amber-300 p-1">
                  <Bell className="w-4 h-4" />
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[9px] font-mono font-bold rounded-full flex items-center justify-center animate-pulse">{unreadCount > 9 ? '9+' : unreadCount}</span>
                  )}
                </button>
                <button onClick={onLogout} className="text-stone-500"><LogOut className="w-4 h-4" /></button>
              </div>
            </div>
            <div className="px-2 pb-2 overflow-x-auto">
              <div className="flex gap-1 min-w-max">
                {nav.map(item => {
                  const Icon = item.icon;
                  const active = activeView === item.id;
                  return (
                    <button key={item.id} onClick={() => setActiveView(item.id)} className={`px-3 py-1.5 text-[10px] uppercase tracking-wider font-mono flex items-center gap-1.5 border transition-colors ${active ? 'border-amber-600/50 bg-amber-500/10 text-amber-300' : 'border-stone-800 text-stone-500'}`}>
                      <Icon className="w-3 h-3" />{item.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="border-b border-stone-800 bg-stone-950/80 backdrop-blur sticky top-0 z-10 hidden md:block">
            <div className="px-8 py-3 flex items-center justify-between">
              <div className="flex items-center gap-3 text-[10px] uppercase tracking-[0.25em] text-stone-500 font-mono">
                <span>Dehradun Main Branch</span><span>·</span><span>Academic Year 2026</span>
              </div>
              <div className="flex items-center gap-4 text-[10px] uppercase tracking-wider font-mono">
                <div className="flex items-center gap-2 text-emerald-400"><span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" /> Sync OK</div>
                <div className="text-stone-500">v1.0 MVP</div>
              </div>
            </div>
          </div>

          <div className="p-4 md:p-8 max-w-[1600px]">
            {activeView === 'command' && <CommandCenter role={role} cells={cells} conflicts={conflicts} teachers={teachers} classrooms={classrooms} batches={batches} currentTime={currentTime} timeSlots={timeSlots} />}
            {activeView === 'teachers' && <TeachersView photos={photos} teachers={teachers} setTeachers={setTeachers} classrooms={classrooms} setClassrooms={setClassrooms} batches={batches} setBatches={setBatches} cells={cells} addTeacherToDB={addTeacherToDB} updateTeacherInDB={updateTeacherInDB} deleteTeacherFromDB={deleteTeacherFromDB} addRoomToDB={addRoomToDB} updateRoomInDB={updateRoomInDB} deleteRoomFromDB={deleteRoomFromDB} addBatchToDB={addBatchToDB} updateBatchInDB={updateBatchInDB} deleteBatchFromDB={deleteBatchFromDB} timeSlots={timeSlots} addTimeSlotToDB={addTimeSlotToDB} updateTimeSlotInDB={updateTimeSlotInDB} deleteTimeSlotFromDB={deleteTimeSlotFromDB} />}
            {activeView === 'free' && <FreeFinder />}
            {activeView === 'conflicts' && <ConflictsView conflicts={conflicts} setConflicts={setConflicts} cells={cells} onGoToTimetable={() => setActiveView('timetable')} />}
            {activeView === 'analytics' && <AnalyticsView />}
            {activeView === 'timetable' && <TimetableView role={role} addNotification={addNotification} cells={cells} cellsByDay={cellsByDay} todayDayKey={todayDayKey} copyDayToDays={copyDayToDays} setCells={setCells} saveCellToDB={saveCellToDB} teachers={teachers} classrooms={classrooms} batches={batches} timeSlots={timeSlots} currentTime={currentTime} />}
            {activeView === 'topics' && <TopicTrackingView />}
            {activeView === 'import' && <ImportView onGoToConflicts={() => setActiveView('conflicts')} />}
          </div>

          <footer className="border-t border-stone-800 px-4 md:px-8 py-6 text-[10px] uppercase tracking-[0.2em] text-stone-600 font-mono flex flex-col md:flex-row md:justify-between gap-2">
            <span>Dreamers Academic Control · Dehradun Main</span>
            <span>{teachers.length} teachers · {Object.keys(cells).length} slots · {batches.length} batches · {classrooms.length} rooms</span>
          </footer>
        </main>
      </div>

      {/* NOTIFICATION PANEL (slide-in from right) */}
      {notifPanelOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex justify-end" onClick={() => { setNotifPanelOpen(false); markAllRead(); }}>
          <div className="w-full max-w-md bg-stone-950 border-l border-amber-700/40 h-full overflow-y-auto animate-in slide-in-from-right" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-stone-950 border-b border-stone-800 p-5 z-10">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.25em] text-amber-500/70 font-mono mb-1">Live Updates</div>
                  <h2 className="text-2xl text-stone-100 font-light" style={{fontFamily: 'Fraunces, serif'}}>Notifications</h2>
                  <div className="text-stone-500 text-xs mt-1">{notifications.length} total · {unreadCount} unread</div>
                </div>
                <button onClick={() => { setNotifPanelOpen(false); markAllRead(); }} className="text-stone-500 hover:text-stone-300">
                  <XCircle className="w-5 h-5" />
                </button>
              </div>
              {notifications.length > 0 && (
                <div className="flex gap-2 mt-3">
                  <button onClick={markAllRead} className="text-[10px] uppercase tracking-wider font-mono border border-stone-700 hover:border-amber-600/40 hover:text-amber-300 text-stone-400 px-3 py-1.5">Mark all read</button>
                  <button onClick={clearNotifications} className="text-[10px] uppercase tracking-wider font-mono border border-red-700/40 hover:bg-red-500/5 text-red-400 px-3 py-1.5">Clear all</button>
                </div>
              )}
            </div>

            {notifications.length === 0 ? (
              <div className="p-12 text-center">
                <Bell className="w-12 h-12 text-stone-700 mx-auto mb-4" strokeWidth={1.5} />
                <div className="text-stone-400 text-sm" style={{fontFamily: 'Fraunces, serif'}}>No notifications yet</div>
                <div className="text-stone-600 text-[11px] mt-1">Schedule changes will appear here in real-time</div>
              </div>
            ) : (
              <div className="divide-y divide-stone-800">
                {notifications.map(n => {
                  const timeAgo = (() => {
                    const diff = Math.floor((Date.now() - new Date(n.timestamp).getTime()) / 1000);
                    if (diff < 60) return 'just now';
                    if (diff < 3600) return `${Math.floor(diff/60)} min ago`;
                    if (diff < 86400) return `${Math.floor(diff/3600)} hr ago`;
                    return `${Math.floor(diff/86400)} day ago`;
                  })();
                  const iconColor = n.type === 'assigned' ? 'text-emerald-400 border-emerald-700/40 bg-emerald-500/10' : n.type === 'updated' ? 'text-amber-400 border-amber-700/40 bg-amber-500/10' : 'text-red-400 border-red-700/40 bg-red-500/10';
                  const Icon = n.type === 'assigned' ? CheckCircle2 : n.type === 'updated' ? Calendar : XCircle;
                  return (
                    <div key={n.id} className={`p-4 ${!n.read ? 'bg-amber-500/[0.03]' : ''} hover:bg-stone-900/40 transition-colors`}>
                      <div className="flex items-start gap-3">
                        <div className={`w-8 h-8 border flex items-center justify-center shrink-0 ${iconColor}`}>
                          <Icon className="w-4 h-4" strokeWidth={2} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-[10px] uppercase tracking-wider font-mono text-stone-500">{n.type === 'assigned' ? 'New Class' : n.type === 'updated' ? 'Class Updated' : 'Class Removed'}</span>
                            {!n.read && <span className="w-1.5 h-1.5 bg-amber-400 rounded-full" />}
                            {n.hadConflict && <Pill variant="warning">had conflict</Pill>}
                          </div>
                          <div className="text-stone-100 text-sm leading-relaxed" style={{fontFamily: 'Fraunces, serif'}}>
                            {n.type === 'assigned' && (
                              <>Manager ne <span className="text-amber-300">{n.teacherFullName}</span> ko <span className="text-stone-300">{n.batch}</span> @ <span className="font-mono text-sky-300">{n.time}</span> assign kiya</>
                            )}
                            {n.type === 'updated' && (
                              <>Manager ne <span className="text-stone-300">{n.batch}</span> @ <span className="font-mono text-sky-300">{n.time}</span> ki class update ki — ab <span className="text-amber-300">{n.teacherFullName}</span> padhayega</>
                            )}
                            {n.type === 'removed' && !n.reassignedTo && (
                              <>Manager ne <span className="text-stone-300">{n.batch}</span> @ <span className="font-mono text-sky-300">{n.time}</span> ki class remove ki (was <span className="text-red-300">{n.teacherFullName}</span>)</>
                            )}
                            {n.type === 'removed' && n.reassignedTo && (
                              <><span className="text-amber-300">{n.teacherFullName}</span> ki <span className="text-stone-300">{n.batch}</span> @ <span className="font-mono text-sky-300">{n.time}</span> class reassigned to {n.reassignedTo} Sir</>
                            )}
                          </div>
                          <div className="text-stone-500 text-[11px] mt-1.5 flex items-center gap-2 flex-wrap">
                            <span className="font-mono">📍 {n.room}</span>
                            <span>·</span>
                            <span>{n.subject}</span>
                            <span className="ml-auto text-stone-600">{timeAgo}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="p-4 border-t border-stone-800 bg-stone-900/40 text-[10px] uppercase tracking-wider text-stone-500 font-mono text-center">
              Real deploy: WhatsApp + SMS bhi auto-fire honge teacher + Director ko
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ============ TEACHER PORTAL — MOBILE FIRST ============
const TeacherPortal = ({ onLogout, me = null, photos = {}, setPhotos = () => {}, notifications = [], markAllRead = () => {}, cells = INITIAL_CELLS, currentTime = '08:00' }) => {
  // FIX BUG: Use logged-in user from props, NOT hardcoded ME. Fall back to ME only if somehow not provided.
  const currentUser = me || ME;
  const [view, setView] = useState('today');
  const [notifPanelOpen, setNotifPanelOpen] = useState(false);
  // Filter notifications for THIS teacher only — using dynamic logged-in user's first name
  // Use short_name from DB if available (handles "Devesh Shukla" vs "Devesh Yadav" disambiguation), fallback to first word
  const myShortName = currentUser.short_name || currentUser.name.split(' ')[0];
  const myNotifications = notifications.filter(n => n.teacher === myShortName);
  const myUnreadCount = myNotifications.filter(n => !n.read).length;

  // Local seconds-precision clock for header display
  const [tickSeconds, setTickSeconds] = useState(getISTSeconds());
  useEffect(() => {
    const tick = () => setTickSeconds(getISTSeconds());
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, []);

  // LIVE sync: derive today's classes from cells + use IST time for status
  const myClasses = Object.entries(cells)
    .filter(([_, cell]) => cell.tch === myShortName)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, cell], idx) => {
      const startTime = key.split('-')[0];
      const batch = key.slice(startTime.length + 1);
      const endHour = parseInt(startTime.split(':')[0]) + 1;
      // Status based on IST time (not hardcoded flag)
      const status = getSlotStatus(startTime, currentTime);
      // Enrich with chapter/topic info from ME.classes if available for same batch
      const defaultClass = ME.classes.find(c => c.batch === batch) || {};
      return {
        id: idx + 1,
        time: `${startTime} - ${endHour.toString().padStart(2, '0')}:00`,
        startTime,
        batch,
        subject: cell.subj,
        room: cell.room,
        status,
        chapter: defaultClass.chapter || 'Current Chapter',
        plannedTopic: defaultClass.plannedTopic || 'Today\'s Topic',
        lastTopic: defaultClass.lastTopic || '—',
        nextTopic: defaultClass.nextTopic || '—',
      };
    });
  const [logModal, setLogModal] = useState(null);
  const [classLogs, setClassLogs] = useState({});
  const [topicInput, setTopicInput] = useState('');
  const [completeStatus, setCompleteStatus] = useState('Partial');
  const [nextTopicInput, setNextTopicInput] = useState('');
  const [syllabusPct, setSyllabusPct] = useState(50);

  const myPhoto = photos[currentUser.id];

  // Dynamic greeting + date (IST-aware)
  const currentHour = parseInt(currentTime.split(':')[0]);
  const greetingTime = currentHour < 12 ? 'Good morning' : currentHour < 17 ? 'Good afternoon' : 'Good evening';
  const greetingName = currentUser.name; // full name e.g. "Devesh Shukla Sir"
  const istNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const todayDate = `${istNow.getDate()} ${MONTHS[istNow.getMonth()]} ${istNow.getFullYear()}`;

  const handlePhotoUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { alert('Photo size should be under 5 MB'); return; }
    if (!file.type.startsWith('image/')) { alert('Please select an image file'); return; }
    const reader = new FileReader();
    reader.onload = (ev) => setPhotos({ ...photos, [currentUser.id]: ev.target.result });
    reader.readAsDataURL(file);
  };

  const removePhoto = () => {
    const newPhotos = { ...photos };
    delete newPhotos[currentUser.id];
    setPhotos(newPhotos);
  };

  const [leaveType, setLeaveType] = useState('Full Day');
  const [leaveReason, setLeaveReason] = useState('');
  const [leaveSubmitted, setLeaveSubmitted] = useState(false);
  const [notif, setNotif] = useState({ wa: true, email: true, push: true, daily: false });

  const submitLeave = () => {
    setLeaveSubmitted(true);
    setTimeout(() => {
      setLeaveSubmitted(false);
      setLeaveReason('');
      setView('today');
    }, 3000);
  };

  const openLog = (cls) => {
    setLogModal(cls);
    const saved = classLogs[cls.id];
    setTopicInput(saved?.topic || cls.plannedTopic);
    setCompleteStatus(saved?.complete || 'Partial');
    setNextTopicInput(saved?.next || cls.nextTopic);
    setSyllabusPct(saved?.pct || cls.chapterPct);
  };

  const saveLog = () => {
    setClassLogs({
      ...classLogs,
      [logModal.id]: { topic: topicInput, complete: completeStatus, next: nextTopicInput, pct: syllabusPct, time: new Date().toLocaleTimeString('en-IN', {hour:'2-digit',minute:'2-digit',hour12:false}) }
    });
    setLogModal(null);
  };

  const isLogged = (cls) => cls.logged || classLogs[cls.id];
  const completed = myClasses.filter(c => c.status === 'completed').length + Object.keys(classLogs).filter(id => !myClasses.find(c=>c.id===parseInt(id))?.logged).length;
  const pendingLogs = myClasses.filter(c => !isLogged(c) && (c.status === 'completed' || c.status === 'running')).length;

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100 max-w-md mx-auto md:border-x md:border-stone-800 relative" style={{fontFamily: '"Fraunces", "Inter", system-ui, sans-serif'}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,300;9..144,400;9..144,500&family=JetBrains+Mono:wght@400;500&display=swap');
        .font-mono { font-family: 'JetBrains Mono', monospace; }
      `}</style>

      <header className="border-b border-stone-800 bg-stone-950 sticky top-0 z-10 backdrop-blur">
        <div className="px-5 py-4 flex items-center gap-3">
          {myPhoto ? (
            <img src={myPhoto} alt={currentUser.name} className="w-10 h-10 object-cover border border-amber-700/40 shrink-0" />
          ) : (
            <div className="w-10 h-10 border border-amber-700/40 bg-amber-500/10 flex items-center justify-center text-amber-300 shrink-0" style={{fontFamily: 'Fraunces, serif'}}>
              {currentUser.name.split(' ').slice(0,2).map(n=>n[0]).join('')}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="text-stone-100 text-sm truncate">{currentUser.name}</div>
            <div className="text-[10px] uppercase tracking-wider text-stone-500 font-mono mt-0.5">{currentUser.subjects?.[0] || '—'} · {currentUser.wing} Wing</div>
          </div>
          <button onClick={() => setNotifPanelOpen(true)} className="relative text-stone-500 hover:text-amber-300 p-2 transition-colors" title="Notifications">
            <Bell className="w-4 h-4" strokeWidth={1.5} />
            {myUnreadCount > 0 && (
              <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-[9px] font-mono font-bold rounded-full flex items-center justify-center animate-pulse">{myUnreadCount > 9 ? '9+' : myUnreadCount}</span>
            )}
          </button>
          <button onClick={onLogout} className="text-stone-500 hover:text-stone-300 p-2">
            <LogOut className="w-4 h-4" strokeWidth={1.5} />
          </button>
        </div>
        <div className="px-5 py-2 bg-stone-900/40 border-t border-stone-800 flex items-center justify-between">
          <Pill variant="live">On Duty</Pill>
          <div className="text-[10px] uppercase tracking-wider text-stone-500 font-mono flex items-center gap-1">
            <Lock className="w-3 h-3" /> Only your data
          </div>
        </div>
      </header>

      <main className="pb-24">
        {view === 'today' && (
          <div className="p-5 space-y-5">
            <div>
              <div className="text-[10px] uppercase tracking-[0.25em] text-amber-500/70 font-mono mb-1">Today · {todayDate}</div>
              <h1 className="text-3xl text-stone-50 font-light tracking-tight" style={{fontFamily: 'Fraunces, serif'}}>{greetingTime}, <span className="italic text-amber-300/90">{greetingName}</span></h1>
            </div>

            <div className="grid grid-cols-3 gap-px bg-stone-800">
              <div className="bg-stone-950 p-3">
                <div className="text-[9px] uppercase tracking-wider text-stone-500 font-mono">Total</div>
                <div className="text-2xl font-light text-stone-100" style={{fontFamily: 'Fraunces, serif'}}>{myClasses.length}</div>
                <div className="text-[9px] text-stone-600 font-mono">classes</div>
              </div>
              <div className="bg-stone-950 p-3">
                <div className="text-[9px] uppercase tracking-wider text-stone-500 font-mono">Done</div>
                <div className="text-2xl font-light text-emerald-300" style={{fontFamily: 'Fraunces, serif'}}>{completed}</div>
                <div className="text-[9px] text-stone-600 font-mono">completed</div>
              </div>
              <div className="bg-stone-950 p-3">
                <div className="text-[9px] uppercase tracking-wider text-stone-500 font-mono">Left</div>
                <div className="text-2xl font-light text-amber-300" style={{fontFamily: 'Fraunces, serif'}}>{myClasses.length - completed}</div>
                <div className="text-[9px] text-stone-600 font-mono">remaining</div>
              </div>
            </div>

            {pendingLogs > 0 && (
              <div className="border border-amber-700/40 bg-amber-500/5 p-3 flex items-center gap-3">
                <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                <div className="flex-1">
                  <div className="text-amber-300 text-xs">Topic log pending</div>
                  <div className="text-stone-400 text-[10px]">{pendingLogs} class needs "today ka topic" update</div>
                </div>
              </div>
            )}

            <div>
              <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
                <div className="text-[10px] uppercase tracking-[0.25em] text-stone-500 font-mono">— Today's classes</div>
                <div className="border border-emerald-700/40 bg-emerald-500/5 px-2 py-1 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
                  <span className="text-[10px] uppercase tracking-wider font-mono text-emerald-300">{tickSeconds} IST</span>
                </div>
              </div>
              <div className="space-y-2.5">
                {myClasses.length === 0 && (
                  <div className="border border-stone-800 bg-stone-950/40 p-6 text-center">
                    <div className="text-stone-400 text-sm" style={{fontFamily: 'Fraunces, serif'}}>Koi class assigned nahi hai aaj</div>
                    <div className="text-stone-600 text-[11px] mt-1">Manager ke schedule mein aapko abhi koi slot nahi mila</div>
                  </div>
                )}
                {myClasses.map((c) => {
                  const isLive = c.status === 'running';
                  const logged = isLogged(c);
                  const userLog = classLogs[c.id];
                  return (
                    <div key={c.id} className={`border ${isLive ? 'border-emerald-700/40 bg-emerald-500/5' : logged ? 'border-stone-800 bg-stone-950/60' : 'border-stone-800 bg-stone-950/40'} p-3.5`}>
                      <div className="flex items-center justify-between mb-2 flex-wrap gap-1">
                        <div className="font-mono text-[11px] text-stone-400">{c.time}</div>
                        {isLive && <Pill variant="live">Live now</Pill>}
                        {logged && !isLive && <Pill variant="default">✓ Logged</Pill>}
                        {!logged && !isLive && c.status === 'scheduled' && <Pill variant="info">Upcoming</Pill>}
                      </div>
                      <div className="flex items-baseline gap-2 mb-1 flex-wrap">
                        <div className="text-stone-100 text-base" style={{fontFamily: 'Fraunces, serif'}}>{c.batch}</div>
                        <div className="text-[10px] text-amber-300/70 font-mono">{c.room}</div>
                      </div>
                      
                      <div className="text-[10px] uppercase tracking-wider text-stone-500 font-mono mt-2">Chapter</div>
                      <div className="text-stone-300 text-sm" style={{fontFamily: 'Fraunces, serif'}}>{c.chapter}</div>
                      
                      <div className="text-[10px] uppercase tracking-wider text-stone-500 font-mono mt-2">Planned topic today</div>
                      <div className="text-amber-300/90 text-sm italic" style={{fontFamily: 'Fraunces, serif'}}>{c.plannedTopic}</div>

                      <div className="border-t border-stone-800 pt-2.5 mt-3 grid grid-cols-2 gap-2">
                        <div>
                          <div className="text-[9px] uppercase tracking-wider text-stone-600 font-mono">Last taught</div>
                          <div className="text-[11px] text-stone-400 mt-0.5">{c.lastTopic}</div>
                        </div>
                        <div>
                          <div className="text-[9px] uppercase tracking-wider text-stone-600 font-mono">Next will be</div>
                          <div className="text-[11px] text-stone-400 mt-0.5">{c.nextTopic}</div>
                        </div>
                      </div>

                      {userLog && (
                        <div className="mt-3 border-l-2 border-emerald-600/40 pl-3 bg-emerald-500/5 py-2">
                          <div className="text-[9px] uppercase tracking-wider text-emerald-400 font-mono mb-1">You logged at {userLog.time}</div>
                          <div className="text-stone-200 text-xs italic" style={{fontFamily: 'Fraunces, serif'}}>"{userLog.topic}"</div>
                          <div className="text-[10px] text-stone-500 mt-1 font-mono">Status: {userLog.complete} · Syllabus: {userLog.pct}%</div>
                        </div>
                      )}

                      {!logged && (
                        <button onClick={() => openLog(c)} className="mt-3 w-full border border-amber-600/50 bg-amber-500/10 text-amber-300 py-2.5 text-[11px] uppercase tracking-wider font-mono hover:bg-amber-500/20 transition-colors flex items-center justify-center gap-2">
                          <ClipboardList className="w-3.5 h-3.5" /> Log today ka topic
                        </button>
                      )}
                      {c.logged && !userLog && (
                        <div className="mt-3 border-l-2 border-emerald-600/40 pl-3 py-1">
                          <div className="text-[9px] uppercase tracking-wider text-emerald-400 font-mono mb-1">Logged earlier</div>
                          <div className="text-stone-300 text-xs italic" style={{fontFamily: 'Fraunces, serif'}}>"{c.loggedTopic}"</div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {view === 'leave' && (
          <div className="p-5 space-y-5">
            <div>
              <div className="text-[10px] uppercase tracking-[0.25em] text-amber-500/70 font-mono mb-1">Leave Request</div>
              <h1 className="text-3xl text-stone-50 font-light tracking-tight" style={{fontFamily: 'Fraunces, serif'}}>Request <span className="italic text-amber-300/90">leave</span></h1>
              <p className="text-stone-500 text-xs mt-1">Director will be notified instantly. Substitute auto-suggested.</p>
            </div>

            <div className="space-y-3">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-stone-500 font-mono mb-1.5">Date range</div>
                <div className="grid grid-cols-2 gap-2">
                  <input type="date" defaultValue="2026-05-26" className="bg-stone-950 border border-stone-800 px-3 py-2.5 text-stone-200 text-sm focus:border-amber-600/40 focus:outline-none font-mono" />
                  <input type="date" defaultValue="2026-05-26" className="bg-stone-950 border border-stone-800 px-3 py-2.5 text-stone-200 text-sm focus:border-amber-600/40 focus:outline-none font-mono" />
                </div>
              </div>

              <div>
                <div className="text-[10px] uppercase tracking-wider text-stone-500 font-mono mb-1.5">Type</div>
                <div className="grid grid-cols-3 gap-2">
                  {['Full Day','Half Day','Few Hours'].map(t => (
                    <button key={t} onClick={() => setLeaveType(t)} className={`border px-3 py-2 text-xs transition-colors ${leaveType === t ? 'border-amber-600/50 bg-amber-500/10 text-amber-300' : 'border-stone-800 hover:border-amber-600/40 text-stone-300'}`}>{t}</button>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-[10px] uppercase tracking-wider text-stone-500 font-mono mb-1.5">Reason</div>
                <textarea rows={3} value={leaveReason} onChange={e => setLeaveReason(e.target.value)} placeholder="Brief reason..." className="w-full bg-stone-950 border border-stone-800 px-3 py-2 text-stone-200 text-sm focus:border-amber-600/40 focus:outline-none" />
              </div>
            </div>

            <div className="border border-amber-700/40 bg-amber-500/5 p-4">
              <div className="text-[10px] uppercase tracking-[0.25em] text-amber-400/80 font-mono mb-2">Classes that will need substitute</div>
              <div className="space-y-1.5">
                {myClasses.map((c) => (
                  <div key={c.id} className="flex items-center gap-2 text-xs">
                    <span className="font-mono text-stone-500">{c.time}</span>
                    <span className="text-stone-300">{c.batch}</span>
                    <span className="text-stone-600 ml-auto text-[10px]">{c.room}</span>
                  </div>
                ))}
              </div>
              <div className="text-[10px] text-stone-500 mt-3 italic">{myClasses.length} classes affected. Director will assign substitutes.</div>
            </div>

            {leaveSubmitted ? (
              <div className="border border-emerald-700/50 bg-emerald-500/10 p-4 text-center animate-in fade-in">
                <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
                <div className="text-emerald-300 text-sm" style={{fontFamily: 'Fraunces, serif'}}>Leave request submitted</div>
                <div className="text-stone-400 text-[11px] mt-1">Director ko notify kar diya · Substitute auto-assigned · WhatsApp confirmation aa raha hai</div>
              </div>
            ) : (
              <button onClick={submitLeave} className="w-full p-3 text-xs uppercase tracking-wider font-mono border border-amber-600/50 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 transition-colors flex items-center justify-center gap-2">
                <Send className="w-3 h-3" /> Submit Leave Request
              </button>
            )}
          </div>
        )}

        {view === 'my' && (
          <div className="p-5 space-y-5">
            <div>
              <div className="text-[10px] uppercase tracking-[0.25em] text-amber-500/70 font-mono mb-1">My profile</div>
              <h1 className="text-3xl text-stone-50 font-light tracking-tight" style={{fontFamily: 'Fraunces, serif'}}>My <span className="italic text-amber-300/90">workload</span></h1>
            </div>

            {/* PHOTO UPLOAD CARD */}
            <div className="border border-stone-800 bg-stone-950/40 p-5">
              <div className="text-[10px] uppercase tracking-[0.25em] text-stone-500 font-mono mb-3">Profile Photo</div>
              <div className="flex items-center gap-4">
                {myPhoto ? (
                  <img src={myPhoto} alt={currentUser.name} className="w-20 h-20 object-cover border-2 border-amber-700/40 shrink-0" />
                ) : (
                  <div className="w-20 h-20 border-2 border-dashed border-stone-700 bg-stone-900/60 flex items-center justify-center text-stone-500 text-xl shrink-0" style={{fontFamily: 'Fraunces, serif'}}>
                    {currentUser.name.split(' ').slice(0,2).map(n=>n[0]).join('')}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-stone-200 text-sm mb-1">{myPhoto ? 'Photo uploaded ✓' : 'No photo yet'}</div>
                  <div className="text-stone-500 text-[10px] leading-relaxed mb-3">
                    {myPhoto ? 'Director ko aapka photo Faculty list mein dikhega' : 'Apni photo daalo taaki Director call list mein pehchaan jaldi ho'}
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <label className="inline-flex items-center gap-2 border border-amber-600/50 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 px-3 py-1.5 text-[10px] uppercase tracking-wider font-mono cursor-pointer transition-colors">
                      <Upload className="w-3 h-3" /> {myPhoto ? 'Change' : 'Upload Photo'}
                      <input type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" />
                    </label>
                    {myPhoto && (
                      <button onClick={removePhoto} className="inline-flex items-center gap-1 border border-red-700/40 text-red-400 hover:bg-red-500/10 px-3 py-1.5 text-[10px] uppercase tracking-wider font-mono transition-colors">
                        <XCircle className="w-3 h-3" /> Remove
                      </button>
                    )}
                  </div>
                </div>
              </div>
              <div className="text-[9px] text-stone-600 font-mono mt-3 italic">
                JPG/PNG · max 5 MB · square photos look best
              </div>
            </div>

            <div className="grid grid-cols-3 gap-px bg-stone-800">
              <div className="bg-stone-950 p-4">
                <div className="text-[9px] uppercase tracking-wider text-stone-500 font-mono">Today</div>
                <div className="text-3xl font-light text-amber-300 mt-1" style={{fontFamily: 'Fraunces, serif'}}>{myClasses.length}</div>
                <div className="text-[9px] text-stone-600 font-mono">classes</div>
              </div>
              <div className="bg-stone-950 p-4">
                <div className="text-[9px] uppercase tracking-wider text-stone-500 font-mono">Wing</div>
                <div className="text-2xl font-light text-stone-100 mt-1" style={{fontFamily: 'Fraunces, serif'}}>{currentUser.wing}</div>
                <div className="text-[9px] text-stone-600 font-mono">section</div>
              </div>
              <div className="bg-stone-950 p-4">
                <div className="text-[9px] uppercase tracking-wider text-stone-500 font-mono">Status</div>
                <div className="text-xl font-light text-emerald-300 mt-1" style={{fontFamily: 'Fraunces, serif'}}>{currentUser.status === 'active' ? 'Active' : currentUser.status === 'leave' ? 'On Leave' : 'On Call'}</div>
                <div className="text-[9px] text-stone-600 font-mono">duty</div>
              </div>
            </div>

            <div className="border border-stone-800 bg-stone-950/40 p-4">
              <div className="text-[10px] uppercase tracking-[0.25em] text-stone-500 font-mono mb-3">Profile</div>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between border-b border-stone-800 pb-2"><span className="text-stone-500">Name</span><span className="text-stone-200">{currentUser.name}</span></div>
                <div className="flex justify-between border-b border-stone-800 pb-2"><span className="text-stone-500">Mobile</span><span className="text-stone-200 font-mono">{currentUser.phone}</span></div>
                <div className="flex justify-between border-b border-stone-800 pb-2"><span className="text-stone-500">Subject</span><span className="text-stone-200">{currentUser.subjects?.[0] || '—'}</span></div>
                <div className="flex justify-between border-b border-stone-800 pb-2"><span className="text-stone-500">Wing</span><span className="text-stone-200">{currentUser.wing}</span></div>
                <div className="flex justify-between pb-2"><span className="text-stone-500">Classes today</span><span className="text-amber-300">{myClasses.length} assigned</span></div>
              </div>
            </div>

            <div className="border border-stone-800 bg-stone-950/40 p-4">
              <div className="text-[10px] uppercase tracking-[0.25em] text-stone-500 font-mono mb-3">Notifications</div>
              <div className="space-y-2">
                {[
                  { key: 'wa', label: 'Class reminders 15 min before' },
                  { key: 'email', label: 'Substitute assignments' },
                  { key: 'push', label: 'Leave decisions' },
                  { key: 'daily', label: 'Director announcements' },
                ].map((n, i) => {
                  const on = notif[n.key];
                  return (
                    <div key={i} className="flex items-center justify-between text-xs">
                      <span className="text-stone-300">{n.label}</span>
                      <button onClick={() => setNotif({ ...notif, [n.key]: !on })} className={`w-8 h-4 rounded-full relative transition-colors ${on ? 'bg-amber-500/40' : 'bg-stone-800'}`}>
                        <div className={`w-3 h-3 rounded-full absolute top-0.5 transition-all ${on ? 'bg-amber-400 right-0.5' : 'bg-stone-500 left-0.5'}`} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="border border-red-700/40 bg-red-500/5 p-4 flex items-start gap-3">
              <ShieldCheck className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
              <div className="flex-1">
                <div className="text-red-300 text-xs">Privacy protected</div>
                <div className="text-stone-500 text-[10px] mt-1 leading-relaxed">You can only see your own schedule, topics, and leaves. Other teachers' data is hidden by database-level access control.</div>
              </div>
            </div>
          </div>
        )}
      </main>

      {logModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur z-50 flex items-end overflow-y-auto" onClick={() => setLogModal(null)}>
          <div className="w-full bg-stone-950 border-t border-stone-800 p-5 space-y-4 max-w-md mx-auto my-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-[0.25em] text-amber-500/70 font-mono">Log class · {logModal.time}</div>
                <h3 className="text-xl text-stone-100 font-light truncate" style={{fontFamily: 'Fraunces, serif'}}>{logModal.batch}</h3>
                <div className="text-stone-500 text-[10px] mt-0.5">Chapter: {logModal.chapter}</div>
              </div>
              <button onClick={() => setLogModal(null)} className="text-stone-500 hover:text-stone-300 shrink-0">
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div>
              <div className="text-[10px] uppercase tracking-wider text-stone-500 font-mono mb-1.5">Aaj kya topic padhaya?</div>
              <textarea value={topicInput} onChange={e=>setTopicInput(e.target.value)} rows={3} placeholder={logModal.plannedTopic} className="w-full bg-stone-900 border border-stone-800 px-3 py-2 text-stone-200 text-sm focus:border-amber-600/40 focus:outline-none" />
              <div className="text-[10px] text-stone-600 mt-1 italic">e.g., "Discriminant — solved 8 examples on board, gave homework on Page 47"</div>
            </div>

            <div>
              <div className="text-[10px] uppercase tracking-wider text-stone-500 font-mono mb-1.5">Topic complete?</div>
              <div className="grid grid-cols-3 gap-2">
                {['Yes','Partial','No'].map(o => (
                  <button key={o} onClick={() => setCompleteStatus(o)} className={`border px-3 py-2 text-xs transition-colors ${completeStatus === o ? 'border-amber-600/50 bg-amber-500/10 text-amber-300' : 'border-stone-800 text-stone-300 hover:border-amber-600/40'}`}>{o}</button>
                ))}
              </div>
            </div>

            <div>
              <div className="text-[10px] uppercase tracking-wider text-stone-500 font-mono mb-1.5">Next topic (substitute ke liye)</div>
              <input value={nextTopicInput} onChange={e=>setNextTopicInput(e.target.value)} className="w-full bg-stone-900 border border-stone-800 px-3 py-2 text-stone-200 text-sm focus:border-amber-600/40 focus:outline-none" />
            </div>

            <div>
              <div className="text-[10px] uppercase tracking-wider text-stone-500 font-mono mb-1.5">Chapter syllabus progress</div>
              <input type="range" min="0" max="100" value={syllabusPct} onChange={e=>setSyllabusPct(parseInt(e.target.value))} className="w-full accent-amber-500" />
              <div className="flex justify-between text-[10px] font-mono text-stone-500 mt-1"><span>0%</span><span className="text-amber-300">{syllabusPct}%</span><span>100%</span></div>
            </div>

            <button onClick={saveLog} className="w-full p-3 text-xs uppercase tracking-wider font-mono border border-amber-600/50 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 transition-colors flex items-center justify-center gap-2">
              <CheckCircle2 className="w-3 h-3" /> Save Log
            </button>
            <div className="text-[10px] text-stone-600 text-center font-mono">Director &amp; substitute (if assigned later) will see this</div>
          </div>
        </div>
      )}

      <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md border-t border-stone-800 bg-stone-950/95 backdrop-blur">
        <div className="grid grid-cols-3">
          {[
            {id:'today',label:'Today',icon:Home},
            {id:'leave',label:'Leave',icon:CalendarOff},
            {id:'my',label:'My Profile',icon:UserCheck},
          ].map(t => {
            const Icon = t.icon;
            const active = view === t.id;
            return (
              <button key={t.id} onClick={() => setView(t.id)} className={`py-3 px-2 flex flex-col items-center gap-1 transition-colors ${active ? 'text-amber-300' : 'text-stone-500 hover:text-stone-300'}`}>
                <Icon className="w-5 h-5" strokeWidth={1.5} />
                <span className="text-[9px] uppercase tracking-wider font-mono">{t.label}</span>
                {active && <div className="w-1 h-1 bg-amber-400 rounded-full" />}
              </button>
            );
          })}
        </div>
      </nav>

      {/* TEACHER NOTIFICATIONS PANEL */}
      {notifPanelOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur z-50 flex items-end" onClick={() => { setNotifPanelOpen(false); markAllRead(); }}>
          <div className="w-full bg-stone-950 border-t border-amber-700/40 max-h-[85vh] overflow-y-auto rounded-t-lg" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-stone-950 border-b border-stone-800 p-5 z-10 flex items-start justify-between">
              <div>
                <div className="text-[10px] uppercase tracking-[0.25em] text-amber-500/70 font-mono mb-1">From Schedule Manager</div>
                <h2 className="text-xl text-stone-100 font-light" style={{fontFamily: 'Fraunces, serif'}}>Aapki notifications</h2>
                <div className="text-stone-500 text-xs mt-0.5">{myNotifications.length} total · {myUnreadCount} new</div>
              </div>
              <button onClick={() => { setNotifPanelOpen(false); markAllRead(); }} className="text-stone-500 hover:text-stone-300">
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            {myNotifications.length === 0 ? (
              <div className="p-12 text-center">
                <Bell className="w-12 h-12 text-stone-700 mx-auto mb-4" strokeWidth={1.5} />
                <div className="text-stone-400 text-sm" style={{fontFamily: 'Fraunces, serif'}}>Koi notification nahi</div>
                <div className="text-stone-600 text-[11px] mt-1">Schedule change hone par yaha turant dikhega</div>
              </div>
            ) : (
              <div className="divide-y divide-stone-800 max-h-[60vh]">
                {myNotifications.map(n => {
                  const timeAgo = (() => {
                    const diff = Math.floor((Date.now() - new Date(n.timestamp).getTime()) / 1000);
                    if (diff < 60) return 'just now';
                    if (diff < 3600) return `${Math.floor(diff/60)} min ago`;
                    if (diff < 86400) return `${Math.floor(diff/3600)} hr ago`;
                    return `${Math.floor(diff/86400)} day ago`;
                  })();
                  const iconColor = n.type === 'assigned' ? 'text-emerald-400 border-emerald-700/40 bg-emerald-500/10' : n.type === 'updated' ? 'text-amber-400 border-amber-700/40 bg-amber-500/10' : 'text-red-400 border-red-700/40 bg-red-500/10';
                  const Icon = n.type === 'assigned' ? CheckCircle2 : n.type === 'updated' ? Calendar : XCircle;
                  return (
                    <div key={n.id} className={`p-4 ${!n.read ? 'bg-amber-500/[0.04]' : ''}`}>
                      <div className="flex items-start gap-3">
                        <div className={`w-9 h-9 border flex items-center justify-center shrink-0 ${iconColor}`}>
                          <Icon className="w-4 h-4" strokeWidth={2} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-[10px] uppercase tracking-wider font-mono text-stone-500">{n.type === 'assigned' ? 'Nayi Class' : n.type === 'updated' ? 'Class Update' : 'Class Cancel'}</span>
                            {!n.read && <span className="w-1.5 h-1.5 bg-amber-400 rounded-full" />}
                          </div>
                          <div className="text-stone-100 text-sm leading-relaxed" style={{fontFamily: 'Fraunces, serif'}}>
                            {n.type === 'assigned' && (
                              <>Aapko <span className="text-amber-300">{n.batch}</span> ko <span className="font-mono text-sky-300">{n.time}</span> par <span className="text-stone-300">{n.subject}</span> padhane assign kiya gaya hai</>
                            )}
                            {n.type === 'updated' && (
                              <>Aapki <span className="text-amber-300">{n.batch}</span> · <span className="font-mono text-sky-300">{n.time}</span> ki class update hui — ab <span className="text-stone-300">{n.subject}</span> (Room {n.room})</>
                            )}
                            {n.type === 'removed' && !n.reassignedTo && (
                              <>Aapki <span className="text-amber-300">{n.batch}</span> · <span className="font-mono text-sky-300">{n.time}</span> wali class cancel kar di gayi hai</>
                            )}
                            {n.type === 'removed' && n.reassignedTo && (
                              <>Aapki <span className="text-amber-300">{n.batch}</span> · <span className="font-mono text-sky-300">{n.time}</span> wali class <span className="text-stone-300">{n.reassignedTo} Sir</span> ko reassign ki gayi</>
                            )}
                          </div>
                          <div className="text-stone-500 text-[11px] mt-2 flex items-center gap-2 flex-wrap">
                            <span className="font-mono">📍 {n.room}</span>
                            <span>·</span>
                            <span>{n.subject}</span>
                            <span className="ml-auto text-stone-600">{timeAgo}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="p-4 border-t border-stone-800 bg-stone-900/40 text-[10px] uppercase tracking-wider text-stone-500 font-mono text-center">
              WhatsApp + SMS bhi alag se aate hain real-time
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ============ MAIN ============
export default function App() {
  // SESSION PERSISTENCE — load from localStorage so refresh doesn't log out
  const [role, setRole] = useState(() => {
    try { return localStorage.getItem('dreamers_role'); } catch { return null; }
  });
  const [loggedInUser, setLoggedInUser] = useState(() => {
    try {
      const saved = localStorage.getItem('dreamers_user');
      return saved ? JSON.parse(saved) : null;
    } catch { return null; }
  });

  // DATA STATES — loaded from Supabase
  const [photos, setPhotos] = useState({});
  const [notifications, setNotifications] = useState([]);
  const [conflicts, setConflicts] = useState([]);
  const [cells, setCells] = useState({});
  const [teachers, setTeachers] = useState([]);
  const [classrooms, setClassrooms] = useState([]);
  const [batches, setBatches] = useState([]);
  const [timeSlots, setTimeSlots] = useState([]); // dynamic time slots from DB
  const [currentTime, setCurrentTime] = useState(getISTTime());
  const [loading, setLoading] = useState(true);
  const [connectionStatus, setConnectionStatus] = useState('connecting'); // 'connecting' | 'connected' | 'error'

  // IST clock tick
  useEffect(() => {
    const tick = () => setCurrentTime(getISTTime());
    tick();
    const interval = setInterval(tick, 15000);
    return () => clearInterval(interval);
  }, []);

  // LOAD ALL DATA FROM SUPABASE ON MOUNT
  const loadAllData = async () => {
    try {
      const [teachersRes, classroomsRes, batchesRes, cellsRes, notifRes, slotsRes] = await Promise.all([
        supabase.from('teachers').select('*').order('id'),
        supabase.from('classrooms').select('*').order('id'),
        supabase.from('batches').select('*').order('id'),
        supabase.from('cells').select('*'),
        supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(50),
        supabase.from('time_slots').select('*').order('sort_order'),
      ]);

      if (teachersRes.data) {
        // Map photo_url into photos object
        const photoMap = {};
        teachersRes.data.forEach(t => {
          if (t.photo_url) photoMap[t.id] = t.photo_url;
        });
        setPhotos(photoMap);
        // Sort teachers alphabetically by name (natural sort)
        setTeachers(sortByField(teachersRes.data, 'name'));
      }
      if (classroomsRes.data) {
        // Sort classrooms alphabetically + naturally (HO 1, HO 2, HO 10 in correct order)
        setClassrooms(sortByField(classroomsRes.data, 'name'));
      }
      if (batchesRes.data) {
        // Normalize DB field names to match UI expectations
        const normalizedBatches = batchesRes.data.map(b => ({
          ...b,
          classTeacher: b.class_teacher, // DB uses snake_case, UI uses camelCase
        }));
        // Sort batches naturally (NDA 1, NDA 2, NDA 10, 11th A, 11th B, 12th A, CDS 1...)
        setBatches(sortByField(normalizedBatches, 'name'));
      }
      if (slotsRes.data) {
        // Normalize DB field names: start_time → startTime, etc.
        const normalizedSlots = slotsRes.data.map(s => ({
          id: s.id,
          startTime: s.start_time,
          endTime: s.end_time,
          label: s.label,
          isBreak: s.is_break,
          sortOrder: s.sort_order,
        }));
        // AUTO-SORT by start_time — naya slot apne aap sahi position pe aa jata hai
        // (e.g., 14:10 slot 14:00 ke baad, 15:00 se pehle automatically)
        setTimeSlots(sortTimeSlots(normalizedSlots));
      }
      if (cellsRes.data) {
        // Convert array to {cell_key: {subj, tch, room}} format
        const cellsMap = {};
        cellsRes.data.forEach(c => {
          cellsMap[c.cell_key] = { subj: c.subject, tch: c.teacher, room: c.room };
        });
        setCells(cellsMap);
      }
      if (notifRes.data) {
        // Map DB fields to UI fields
        const notifs = notifRes.data.map(n => ({
          id: n.id,
          timestamp: new Date(n.created_at),
          read: n.read,
          type: n.type,
          teacher: n.teacher_short_name,
          teacherFullName: n.teacher_full_name,
          batch: n.batch,
          time: n.time_slot,
          subject: n.subject,
          room: n.room,
          hadConflict: n.had_conflict,
          reassignedTo: n.reassigned_to,
        }));
        setNotifications(notifs);
      }
      setConnectionStatus('connected');
    } catch (err) {
      console.error('Failed to load data:', err);
      setConnectionStatus('error');
    }
    setLoading(false);
  };

  useEffect(() => {
    loadAllData();

    // REALTIME SUBSCRIPTIONS — when anyone changes data, everyone sees it
    const channel = supabase
      .channel('dreamers-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'teachers' }, () => loadAllData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'classrooms' }, () => loadAllData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'batches' }, () => loadAllData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cells' }, () => loadAllData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, () => loadAllData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'time_slots' }, () => loadAllData())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  // ADD NOTIFICATION — writes to Supabase
  const addNotification = async (data) => {
    const dbRow = {
      teacher_short_name: data.teacher,
      type: data.type,
      batch: data.batch,
      time_slot: data.time,
      subject: data.subject,
      room: data.room,
      teacher_full_name: data.teacherFullName,
      had_conflict: data.hadConflict || false,
      reassigned_to: data.reassignedTo || null,
      read: false,
    };
    const { error } = await supabase.from('notifications').insert([dbRow]);
    if (error) console.error('Notification save failed:', error);
    // Realtime subscription will update state
  };

  const markAllRead = async () => {
    // Mark unread notifications as read
    const unreadIds = notifications.filter(n => !n.read).map(n => n.id);
    if (unreadIds.length === 0) return;
    const { error } = await supabase.from('notifications').update({ read: true }).in('id', unreadIds);
    if (error) console.error('Mark read failed:', error);
  };

  const clearNotifications = async () => {
    if (!confirm('Clear all notifications? This cannot be undone.')) return;
    const { error } = await supabase.from('notifications').delete().neq('id', 0);
    if (error) console.error('Clear failed:', error);
  };

  // SET CELLS — writes to Supabase (used by Manager when assigning classes)
  const updateCells = async (newCells) => {
    setCells(newCells); // optimistic update
    // Find what changed: compare with current state, then upsert/delete
    // Simplest approach: clear all and re-insert (works for small datasets)
    // Better approach: track individual changes
    // For now, the saveAssign in TimetableView handles individual cell saves
  };

  // SAVE INDIVIDUAL CELL — Day-aware. cellKeyShort = '08:00-NDA 1' (without day prefix)
  // Builds full DB key as 'Mon-08:00-NDA 1' and saves
  const saveCellToDB = async (day, cellKeyShort, cellData) => {
    const fullCellKey = buildCellKey(day, cellKeyShort);
    const timeSlot = cellKeyShort.split('-')[0];
    const batch = cellKeyShort.slice(timeSlot.length + 1);
    // Optimistic update: update local state immediately for instant UI feedback
    setCells(prev => {
      const next = { ...prev };
      if (cellData === null || cellData === undefined) {
        delete next[fullCellKey];
      } else {
        next[fullCellKey] = cellData;
      }
      return next;
    });
    if (!cellData) {
      // DELETE cell
      const { error } = await supabase.from('cells').delete().eq('cell_key', fullCellKey);
      if (error) console.error('Cell delete failed:', error);
    } else {
      // UPSERT cell
      const { error } = await supabase.from('cells').upsert({
        cell_key: fullCellKey,
        day: day,
        time_slot: timeSlot,
        batch: batch,
        subject: cellData.subj,
        teacher: cellData.tch,
        room: cellData.room,
      }, { onConflict: 'cell_key' });
      if (error) console.error('Cell save failed:', error);
    }
  };

  // COPY DAY — Copy source day's full timetable to one or more target days
  // sourceDay: 'Mon' | 'Tue' | ... | 'Sun'
  // targetDays: array of day strings
  // Returns: { copied, errors } stats
  const copyDayToDays = async (sourceDay, targetDays) => {
    if (!sourceDay || !targetDays || targetDays.length === 0) return { copied: 0, errors: 0 };
    // Get source cells (those starting with sourceDay-)
    const sourcePrefix = `${sourceDay}-`;
    const sourceCells = Object.entries(cells).filter(([key]) => key.startsWith(sourcePrefix));
    if (sourceCells.length === 0) {
      alert(`${sourceDay} mein koi classes nahi hain — pehle source day setup karo.`);
      return { copied: 0, errors: 0 };
    }
    let copied = 0, errors = 0;
    // For each target day:
    // 1. Delete existing cells for target day
    // 2. Insert copies of source cells with target day prefix
    for (const targetDay of targetDays) {
      if (targetDay === sourceDay) continue; // skip self
      try {
        // DELETE all cells for target day
        const targetPrefix = `${targetDay}-`;
        const { error: delErr } = await supabase.from('cells').delete().like('cell_key', `${targetPrefix}%`);
        if (delErr) { console.error('Delete failed for', targetDay, delErr); errors++; continue; }
        // INSERT copies with target day prefix
        const rowsToInsert = sourceCells.map(([fullKey, data]) => {
          const { shortKey } = parseCellKey(fullKey);
          const timeSlot = shortKey.split('-')[0];
          const batch = shortKey.slice(timeSlot.length + 1);
          return {
            cell_key: buildCellKey(targetDay, shortKey),
            day: targetDay,
            time_slot: timeSlot,
            batch,
            subject: data.subj,
            teacher: data.tch,
            room: data.room,
          };
        });
        if (rowsToInsert.length > 0) {
          const { error: insErr } = await supabase.from('cells').insert(rowsToInsert);
          if (insErr) { console.error('Insert failed for', targetDay, insErr); errors++; continue; }
        }
        copied += rowsToInsert.length;
      } catch (e) {
        console.error('Copy day error:', e);
        errors++;
      }
    }
    // Realtime will refresh cells state
    return { copied, errors };
  };

  // TEACHERS CRUD
  const updateTeachers = async (newList) => {
    setTeachers(newList); // optimistic
    // Individual operations handled by add/edit/delete functions
  };

  const addTeacherToDB = async (teacher) => {
    const { data, error } = await supabase.from('teachers').insert([{
      name: teacher.name,
      subjects: teacher.subjects,
      wing: teacher.wing,
      status: teacher.status || 'active',
      phone: teacher.phone,
    }]).select();
    if (error) {
      alert('Failed to add teacher: ' + error.message);
      return null;
    }
    return data?.[0];
  };

  const updateTeacherInDB = async (id, updates) => {
    const { error } = await supabase.from('teachers').update({
      name: updates.name,
      subjects: updates.subjects,
      wing: updates.wing,
      phone: updates.phone,
      updated_at: new Date().toISOString(),
    }).eq('id', id);
    if (error) alert('Failed to update teacher: ' + error.message);
  };

  const deleteTeacherFromDB = async (id) => {
    const { error } = await supabase.from('teachers').delete().eq('id', id);
    if (error) alert('Failed to delete teacher: ' + error.message);
  };

  // CLASSROOMS CRUD
  const addRoomToDB = async (room) => {
    const { data, error } = await supabase.from('classrooms').insert([{
      name: room.name,
      wing: room.wing,
      capacity: room.capacity,
      floor: room.floor,
    }]).select();
    if (error) { alert('Failed to add room: ' + error.message); return null; }
    return data?.[0];
  };

  const updateRoomInDB = async (id, updates) => {
    // Fetch old room name (for cascade)
    const { data: oldRoom } = await supabase.from('classrooms').select('name').eq('id', id).single();
    const oldName = oldRoom?.name;
    const { error } = await supabase.from('classrooms').update({
      name: updates.name,
      wing: updates.wing,
      capacity: updates.capacity,
      floor: updates.floor,
    }).eq('id', id);
    if (error) { alert('Failed to update room: ' + error.message); return; }
    // CASCADE: If room renamed, update all cells referencing this room
    if (oldName && oldName !== updates.name) {
      const { error: cellErr } = await supabase.from('cells').update({ room: updates.name }).eq('room', oldName);
      if (cellErr) console.error('Failed to cascade room rename:', cellErr);
    }
  };

  const deleteRoomFromDB = async (id) => {
    // Fetch room name to find affected cells
    const { data: room } = await supabase.from('classrooms').select('name').eq('id', id).single();
    if (room?.name) {
      // Check how many cells use this room
      const { count } = await supabase.from('cells').select('*', { count: 'exact', head: true }).eq('room', room.name);
      if (count && count > 0) {
        if (!confirm(`${room.name} mein ${count} classes assign hain. Delete karne par yeh cells bhi delete ho jayengi. Continue?`)) {
          return;
        }
        // Delete all cells using this room
        await supabase.from('cells').delete().eq('room', room.name);
      }
    }
    const { error } = await supabase.from('classrooms').delete().eq('id', id);
    if (error) alert('Failed to delete room: ' + error.message);
  };

  // BATCHES CRUD
  const addBatchToDB = async (batch) => {
    const { data, error } = await supabase.from('batches').insert([{
      name: batch.name,
      wing: batch.wing,
      strength: batch.strength,
      class_teacher: batch.classTeacher,
    }]).select();
    if (error) { alert('Failed to add batch: ' + error.message); return null; }
    return data?.[0];
  };

  const updateBatchInDB = async (id, updates) => {
    // STEP 1: Fetch old batch name (to detect rename and cascade to cells)
    const { data: oldBatch } = await supabase.from('batches').select('name').eq('id', id).single();
    const oldName = oldBatch?.name;
    // STEP 2: Update batch row
    const { error } = await supabase.from('batches').update({
      name: updates.name,
      wing: updates.wing,
      strength: updates.strength,
      class_teacher: updates.classTeacher,
    }).eq('id', id);
    if (error) { alert('Failed to update batch: ' + error.message); return; }
    // STEP 3: If name changed, CASCADE to cells (rebuild cell_key + batch column)
    if (oldName && oldName !== updates.name) {
      const { data: oldCells } = await supabase.from('cells').select('*').eq('batch', oldName);
      if (oldCells && oldCells.length > 0) {
        for (const cell of oldCells) {
          const newCellKey = `${cell.day || 'Mon'}-${cell.time_slot}-${updates.name}`;
          await supabase.from('cells').update({
            cell_key: newCellKey,
            batch: updates.name,
          }).eq('id', cell.id);
        }
        console.log(`Cascaded ${oldCells.length} cells from "${oldName}" → "${updates.name}"`);
      }
    }
  };

  const deleteBatchFromDB = async (id) => {
    // STEP 1: Fetch batch name first
    const { data: batch } = await supabase.from('batches').select('name').eq('id', id).single();
    // STEP 2: Cascade delete cells for this batch
    if (batch?.name) {
      const { error: cellDelErr } = await supabase.from('cells').delete().eq('batch', batch.name);
      if (cellDelErr) console.error('Failed to delete batch cells:', cellDelErr);
    }
    // STEP 3: Delete batch row
    const { error } = await supabase.from('batches').delete().eq('id', id);
    if (error) alert('Failed to delete batch: ' + error.message);
  };

  // TIME SLOTS CRUD
  const addTimeSlotToDB = async (slot) => {
    const maxOrder = Math.max(0, ...timeSlots.map(s => s.sortOrder || 0));
    const { data, error } = await supabase.from('time_slots').insert([{
      start_time: slot.startTime,
      end_time: slot.endTime,
      label: slot.label,
      is_break: slot.isBreak || false,
      sort_order: maxOrder + 1,
    }]).select();
    if (error) { alert('Failed to add time slot: ' + error.message); return null; }
    return data?.[0];
  };

  const updateTimeSlotInDB = async (id, updates) => {
    const { error } = await supabase.from('time_slots').update({
      start_time: updates.startTime,
      end_time: updates.endTime,
      label: updates.label,
      is_break: updates.isBreak,
      updated_at: new Date().toISOString(),
    }).eq('id', id);
    if (error) alert('Failed to update time slot: ' + error.message);
  };

  const deleteTimeSlotFromDB = async (id) => {
    const { error } = await supabase.from('time_slots').delete().eq('id', id);
    if (error) alert('Failed to delete time slot: ' + error.message);
  };

  // PHOTO UPLOAD — saves base64 directly to teachers.photo_url
  const setPhotosWithDB = async (newPhotos) => {
    setPhotos(newPhotos);
    // Find which teacher changed and update their photo_url
    Object.keys(newPhotos).forEach(async (teacherId) => {
      if (photos[teacherId] !== newPhotos[teacherId]) {
        await supabase.from('teachers').update({ photo_url: newPhotos[teacherId] }).eq('id', teacherId);
      }
    });
    // Check for removed photos
    Object.keys(photos).forEach(async (teacherId) => {
      if (!newPhotos[teacherId]) {
        await supabase.from('teachers').update({ photo_url: null }).eq('id', teacherId);
      }
    });
  };

  // LOGIN HANDLER — saves to localStorage for refresh persistence
  const handleLogin = (selectedRole, user) => {
    setRole(selectedRole);
    setLoggedInUser(user);
    try {
      localStorage.setItem('dreamers_role', selectedRole);
      localStorage.setItem('dreamers_user', JSON.stringify(user));
    } catch (e) { console.warn('localStorage unavailable:', e); }
  };

  // LOGOUT HANDLER — clears session
  const handleLogout = () => {
    setRole(null);
    setLoggedInUser(null);
    try {
      localStorage.removeItem('dreamers_role');
      localStorage.removeItem('dreamers_user');
    } catch (e) {}
  };

  // DAY-AWARE: Group cells by day, find today's day key (must be BEFORE any early return — React Hooks rule)
  const cellsByDay = useMemo(() => groupCellsByDay(cells), [cells]);
  const todayDayKey = getISTDay();
  const todayCells = cellsByDay[todayDayKey] || {};

  // SHOW LOADING SCREEN WHILE FETCHING DATA
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-950 text-stone-100">
        <div className="text-center">
          <div className="w-16 h-16 border-2 border-amber-400/30 border-t-amber-400 rounded-full animate-spin mx-auto mb-6" />
          <div className="text-xl text-amber-300 font-light" style={{fontFamily: 'Fraunces, serif'}}>Loading Dreamers</div>
          <div className="text-stone-500 text-xs mt-2 font-mono uppercase tracking-wider">
            {connectionStatus === 'error' ? 'Connection error · check internet' : 'Connecting to database...'}
          </div>
        </div>
      </div>
    );
  }

  if (!role) return <LoginScreen onLogin={handleLogin} teachers={teachers} />;
  if (role === 'teacher') return <TeacherPortal onLogout={handleLogout} me={loggedInUser} photos={photos} setPhotos={setPhotosWithDB} notifications={notifications} markAllRead={markAllRead} cells={todayCells} currentTime={currentTime} timeSlots={timeSlots} />;
  return <DirectorPortal onLogout={handleLogout} role={role} loggedInUser={loggedInUser} photos={photos} notifications={notifications} addNotification={addNotification} markAllRead={markAllRead} clearNotifications={clearNotifications} conflicts={conflicts} setConflicts={setConflicts} cells={todayCells} cellsByDay={cellsByDay} todayDayKey={todayDayKey} copyDayToDays={copyDayToDays} setCells={setCells} saveCellToDB={saveCellToDB} teachers={teachers} setTeachers={setTeachers} addTeacherToDB={addTeacherToDB} updateTeacherInDB={updateTeacherInDB} deleteTeacherFromDB={deleteTeacherFromDB} classrooms={classrooms} setClassrooms={setClassrooms} addRoomToDB={addRoomToDB} updateRoomInDB={updateRoomInDB} deleteRoomFromDB={deleteRoomFromDB} batches={batches} setBatches={setBatches} addBatchToDB={addBatchToDB} updateBatchInDB={updateBatchInDB} deleteBatchFromDB={deleteBatchFromDB} timeSlots={timeSlots} addTimeSlotToDB={addTimeSlotToDB} updateTimeSlotInDB={updateTimeSlotInDB} deleteTimeSlotFromDB={deleteTimeSlotFromDB} currentTime={currentTime} />;
}
