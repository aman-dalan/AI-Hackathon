// import React from "react";

// const TestResults = ({ results = [] }) => {
//   // Sample test results for demonstration
//   const sampleResults = [
//     {
//       id: 1,
//       name: "Test Case 1",
//       status: "passed",
//       input: "nums = [2,7,11,15], target = 9",
//       expected: "[0,1]",
//       actual: "[0,1]",
//     },
//     {
//       id: 2,
//       name: "Test Case 2",
//       status: "failed",
//       input: "nums = [3,2,4], target = 6",
//       expected: "[1,2]",
//       actual: "[0,1]",
//     },
//     {
//       id: 3,
//       name: "Test Case 3",
//       status: "pending",
//       input: "nums = [3,3], target = 6",
//       expected: "[0,1]",
//       actual: null,
//     },
//   ];

//   const displayResults = results.length > 0 ? results : sampleResults;

//   const getStatusColor = (status) => {
//     switch (status) {
//       case "passed":
//         return "bg-green-100 text-green-800";
//       case "failed":
//         return "bg-red-100 text-red-800";
//       case "pending":
//         return "bg-yellow-100 text-yellow-800";
//       default:
//         return "bg-gray-100 text-gray-800";
//     }
//   };

//   return (
//     <div className="bg-white rounded-lg shadow-md h-full flex flex-col">
//       {/* Header */}
//       <div className="p-4 border-b">
//         <h2 className="text-lg font-semibold text-gray-800">Test Cases</h2>
//       </div>

//       {/* Test Results List */}
//       <div className="flex-1 overflow-y-auto">
//         {displayResults.map((test) => (
//           <div
//             key={test.id}
//             className="border-b last:border-b-0 p-4 hover:bg-gray-50"
//           >
//             <div className="flex items-center justify-between mb-2">
//               <h3 className="font-medium text-gray-800">{test.name}</h3>
//               <span
//                 className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(
//                   test.status
//                 )}`}
//               >
//                 {test.status.charAt(0).toUpperCase() + test.status.slice(1)}
//               </span>
//             </div>

//             <div className="space-y-2 text-sm">
//               <div>
//                 <span className="text-gray-500">Input:</span>
//                 <pre className="mt-1 bg-gray-50 p-2 rounded">{test.input}</pre>
//               </div>
//               <div>
//                 <span className="text-gray-500">Expected:</span>
//                 <pre className="mt-1 bg-gray-50 p-2 rounded">
//                   {test.expected}
//                 </pre>
//               </div>
//               {test.actual && (
//                 <div>
//                   <span className="text-gray-500">Actual:</span>
//                   <pre className="mt-1 bg-gray-50 p-2 rounded">
//                     {test.actual}
//                   </pre>
//                 </div>
//               )}
//             </div>
//           </div>
//         ))}
//       </div>

//       {/* Summary */}
//       <div className="p-4 border-t bg-gray-50">
//         <div className="flex justify-between text-sm">
//           <div className="flex space-x-4">
//             <span className="flex items-center">
//               <span className="w-3 h-3 bg-green-500 rounded-full mr-1"></span>
//               Passed:{" "}
//               {displayResults.filter((t) => t.status === "passed").length}
//             </span>
//             <span className="flex items-center">
//               <span className="w-3 h-3 bg-red-500 rounded-full mr-1"></span>
//               Failed:{" "}
//               {displayResults.filter((t) => t.status === "failed").length}
//             </span>
//             <span className="flex items-center">
//               <span className="w-3 h-3 bg-yellow-500 rounded-full mr-1"></span>
//               Pending:{" "}
//               {displayResults.filter((t) => t.status === "pending").length}
//             </span>
//           </div>
//           <button className="text-blue-500 hover:text-blue-600 font-medium">
//             Run All Tests
//           </button>
//         </div>
//       </div>
//     </div>
//   );
// };

// export default TestResults;
