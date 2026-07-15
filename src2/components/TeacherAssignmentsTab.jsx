import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import toast from 'react-hot-toast';

export default function TeacherAssignmentsTab() {
  const [teachers, setTeachers] = useState([]);
  const [classes, setClasses] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);

    const { data: tData } = await supabase
      .from('staff')
      .select('id, first_name, last_name, email')
      .eq('position', 'Teacher');

    const { data: cData } = await supabase
      .from('classes')
      .select('id, name, level_id, levels(id, name, sort_order)');

    const { data: aData } = await supabase
      .from('teacher_classes')
      .select('*');

    // ── TRI SÉCURISÉ (Immutabilité) : par sort_order du niveau, puis par nom ──
    const sortedClasses = [...(cData || [])].sort((a, b) => {
      const orderA = a.levels?.sort_order ?? 999;
      const orderB = b.levels?.sort_order ?? 999;
      if (orderA !== orderB) return orderA - orderB;
      return (a.name || '').localeCompare(b.name || '');
    });

    setTeachers(tData || []);
    setClasses(sortedClasses);
    setAssignments(aData || []);
    setLoading(false);
  }

  // ── Regroupement par niveau garanti par un Array (au lieu d'un Objet JS) ──
  const groupedClassesArray = useMemo(() => {
    const groupsMap = {};

    classes.forEach(cls => {
      const levelName = cls.levels?.name || 'Other';
      if (!groupsMap[levelName]) {
        groupsMap[levelName] = {
          levelName: levelName,
          sortOrder: cls.levels?.sort_order ?? 999,
          classes: []
        };
      }
      groupsMap[levelName].classes.push(cls);
    });

    // On retourne un tableau d'objets, trié de manière stricte
    return Object.values(groupsMap).sort((a, b) => a.sortOrder - b.sortOrder);
  }, [classes]);

  // Extraction aplatie pour les colonnes et cases à cocher, synchronisée avec l'en-tête
  const flattenedClasses = useMemo(() => {
    return groupedClassesArray.flatMap(group => group.classes);
  }, [groupedClassesArray]);

  async function toggleAssignment(teacherId, classId) {
    const exists = assignments.find(
      a => a.teacher_id === teacherId && a.class_id === classId.toString()
    );

    if (exists) {
      await supabase.from('teacher_classes').delete().eq('id', exists.id);
      toast.success('Assignment removed');
    } else {
      await supabase.from('teacher_classes').insert({
        teacher_id: teacherId,
        class_id: classId.toString(),
      });
      toast.success('Assignment added');
    }
    fetchData();
  }

  if (loading) return <div>Loading...</div>;

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-bold text-gray-800">Teacher Class Assignments</h3>
      <div className="bg-white border rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="p-3 text-left min-w-[150px] sticky left-0 bg-gray-50">Teacher</th>
              {groupedClassesArray.map((group) => (
                <th
                  key={group.levelName}
                  colSpan={group.classes.length}
                  className="p-2 text-center text-xs font-semibold text-gray-600 border-l border-gray-200 bg-gray-100"
                >
                  {group.levelName}
                </th>
              ))}
            </tr>
            <tr>
              <th className="p-3 sticky left-0 bg-gray-50"></th>
              {flattenedClasses.map(c => (
                <th key={c.id} className="p-2 text-center font-medium text-gray-700 border-l border-gray-200 min-w-[70px]">
                  {c.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {teachers.map(t => (
              <tr key={t.id} className="border-b hover:bg-gray-50">
                <td className="p-3 font-medium sticky left-0 bg-white border-r border-gray-200">
                  {t.first_name} {t.last_name}
                </td>
                {flattenedClasses.map(c => (
                  <td key={c.id} className="p-2 text-center border-l border-gray-100">
                    <input
                      type="checkbox"
                      checked={!!assignments.find(
                        a => a.teacher_id === t.id && a.class_id === c.id.toString()
                      )}
                      onChange={() => toggleAssignment(t.id, c.id)}
                      className="cursor-pointer w-4 h-4 text-blue-600"
                    />
                  </td>
                ))}
              </tr>
            ))}
            {teachers.length === 0 && (
              <tr>
                <td colSpan={flattenedClasses.length + 1} className="p-6 text-center text-gray-400">
                  No teachers found with position 'Teacher'.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}