import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import toast from 'react-hot-toast';

export default function TeacherAssignmentsTab() {
  const [teachers, setTeachers] = useState([]);
  const [classes, setClasses] = useState([]);
  const [assignments, setAssignments] = useState([]); // stocke les liens existants
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    // 1. Récupérer les profils avec poste 'Teacher'
    const { data: tData } = await supabase.from('staff').select('id, first_name, last_name, email').eq('position', 'Teacher');
    // 2. Récupérer toutes les classes
    const { data: cData } = await supabase.from('classes').select('id, name');
    // 3. Récupérer les liens actuels
    const { data: aData } = await supabase.from('teacher_classes').select('*');
    
    setTeachers(tData || []);
    setClasses(cData || []);
    setAssignments(aData || []);
    setLoading(false);
  }

  async function toggleAssignment(teacherId, classId) {
    const exists = assignments.find(a => a.teacher_id === teacherId && a.class_id === classId.toString());

    if (exists) {
      await supabase.from('teacher_classes').delete().eq('id', exists.id);
      toast.success("Assignment removed");
    } else {
      await supabase.from('teacher_classes').insert({ teacher_id: teacherId, class_id: classId.toString() });
      toast.success("Assignment added");
    }
    fetchData();
  }

  if (loading) return <div>Loading...</div>;

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-bold text-gray-800">Teacher Class Assignments</h3>
      <div className="bg-white border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="p-3 text-left">Teacher</th>
              {classes.map(c => <th key={c.id} className="p-3 text-center">{c.name}</th>)}
            </tr>
          </thead>
          <tbody>
            {teachers.map(t => (
              <tr key={t.id} className="border-b">
                <td className="p-3 font-medium">{t.first_name} {t.last_name}</td>
                {classes.map(c => (
                  <td key={c.id} className="p-3 text-center">
                    <input 
                      type="checkbox"
                      checked={!!assignments.find(a => a.teacher_id === t.id && a.class_id === c.id.toString())}
                      onChange={() => toggleAssignment(t.id, c.id)}
                      className="cursor-pointer"
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}