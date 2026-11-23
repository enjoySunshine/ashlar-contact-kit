
import {
	Mesh,
	BufferGeometry,
	BufferAttribute,
	SphereGeometry,
	Vector3,
	Quaternion,
	Matrix4,
	Sphere,
	Box3,
	Euler,
	Ray,
	Raycaster,
	Scene,
	Triangle,
	TorusGeometry,
	MeshBasicMaterial,
	BoxGeometry,
	FrontSide,
	BackSide,
} from 'three';
import {
	MeshBVH as _MeshBVH,
	ExtendedTriangle,
	acceleratedRaycast,
	computeBoundsTree,
	disposeBoundsTree,
	getTriangleHitPointInfo,
	CONTAINED,
	INTERSECTED,
	NOT_INTERSECTED,
	CENTER,
} from 'three-mesh-bvh';
import { runTestMatrix } from './utils.js';

Mesh.prototype.raycast = acceleratedRaycast;
BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;

runTestMatrix( {
	strategy: [ CENTER ],
}, ( desc, options ) => {

	describe( `Running with Options: ${ desc }`, () => runSuiteWithOptions( options ) );

} );

function runSuiteWithOptions( defaultOptions ) {

	const MeshBVH = class extends _MeshBVH {

		constructor( geometry, options ) {

			super( geometry, Object.assign( {}, defaultOptions, options ) );

		}

	};

	describe( 'Shapecast containment', () => {

		let bvh = null;
		let intersectGeometry = null;

		function getIntersectsBoxFunction( sphere ) {

			const tempVec = new Vector3();
			return box => {

				const intersects = sphere.intersectsBox( box );
				const { min, max } = box;
				if ( intersects ) {

					for ( let x = 0; x <= 1; x ++ ) {

						for ( let y = 0; y <= 1; y ++ ) {

							for ( let z = 0; z <= 1; z ++ ) {

								tempVec.set(
									x === 0 ? min.x : max.x,
									y === 0 ? min.y : max.y,
									z === 0 ? min.z : max.z
								);
								if ( ! sphere.containsPoint( tempVec ) ) {

									return INTERSECTED;

								}

							}

						}

					}

					return CONTAINED;

				}

				return intersects ? INTERSECTED : NOT_INTERSECTED;

			};

		}

		beforeAll( () => {

			const geom = new SphereGeometry( 1, 50, 50 );
			bvh = new MeshBVH( geom, { verbose: false } );
			intersectGeometry = new SphereGeometry( 1, 50, 50 );
			intersectGeometry.computeBoundsTree();

		} );

		it( 'should return that all triangles are contained if the bounds are within the shape.', () => {

			const sphere = new Sphere();
			sphere.radius = 3;

			let allContained = true;
			let numContained = 0;
			bvh.shapecast(
				{
					intersectsBounds: getIntersectsBoxFunction( sphere ),
					intersectsTriangle: ( tri, index, contained ) => {

						allContained = contained && allContained;
						numContained ++;

					}
				}
			);

			expect( allContained ).toBeTruthy();
			expect( numContained ).toEqual( 4900 );

		} );

		it( 'should return that all triangles are not contained within the bounds shape.', () => {

			const sphere = new Sphere();
			sphere.radius = 3;
			sphere.center.x = 3;

			let allContained = true;
			let numContained = 0;
			bvh.shapecast(
				{
					intersectsBounds: getIntersectsBoxFunction( sphere ),
					intersectsTriangle: ( tri, index, contained ) => {

						allContained = contained && allContained;
						if ( contained ) {

							numContained ++;

						}

					}
				}
			);

			expect( allContained ).toBeFalsy();
			expect( numContained ).toEqual( 1540 );

		} );

		it( 'should return that no triangles are contained within the bounds shape.', () => {

			const sphere = new Sphere();
			sphere.radius = 3;
			sphere.center.x = 5.99;

			let trianglesIterated = 0;
			bvh.shapecast(
				{
					intersectsBounds: getIntersectsBoxFunction( sphere ),
					intersectsTriangle: () => {

						trianglesIterated ++;

					}
				}
			);

			expect( trianglesIterated ).toEqual( 0 );

		} );

		it( 'should not use the same triangle twice when being recursively called.', () => {

			const geometry = new SphereGeometry();
			const bvh = new MeshBVH( geometry );

			let checks = 0;
			bvh.shapecast( {

				intersectsBounds: () => true,
				intersectsTriangle: tri => {

					bvh.shapecast( {

						intersectsBounds: () => true,
						intersectsTriangle: tri2 => {

							expect( tri2 ).not.toBe( tri );
							checks ++;
							return true;

						}

					} );

					return true;

				}

			} );

			expect( checks ).not.toBe( 0 );

		} );

		it( 'should not use the same box twice when being recursively called.', () => {

			const geometry = new SphereGeometry();
			const bvh = new MeshBVH( geometry );

			let boundsChecks = 0;
			let rangeChecks = 0;
			bvh.shapecast( {

				intersectsBounds: box1 => {

					bvh.shapecast( {

						intersectsBounds: box2 => {

							expect( box1 ).not.toBe( box2 );
							boundsChecks ++;
							return true;

						},

						intersectsRange: ( offset, count, contained, depth, nodeIndex, box2 ) => {

							expect( box1 ).not.toBe( box2 );
							boundsChecks ++;
							return true;

						}

					} );
					return true;

				},
				intersectsRange: ( offset, count, contained, depth, nodeIndex, box1 ) => {

					bvh.shapecast( {

						intersectsBounds: box2 => {

							expect( box1 ).not.toBe( box2 );
							rangeChecks ++;
							return true;

						},

						intersectsRange: ( offset, count, contained, depth, nodeIndex, box2 ) => {

							expect( box1 ).not.toBe( box2 );
							rangeChecks ++;
							return true;

						}

					} );

					return true;

				}

			} );

			expect( rangeChecks ).not.toEqual( 0 );
			expect( boundsChecks ).not.toEqual( 0 );

		} );

	} );

	describe( 'Bvhcast', () => {


		describe( 'Simple intersecting cubes', () => {

			let matrix;
			let cubeA, cubeB;
			beforeAll( () => {

				cubeA = new BoxGeometry( 2, 2, 2 );
				cubeA.clearGroups();

				cubeB = new BoxGeometry( 2, 2, 2 );
				cubeB.clearGroups();

				matrix = new Matrix4();

			} );

			it( 'should compare triangles that intersect', () => {

				const bvhA = new MeshBVH( cubeA, { targetLeafSize: 1 } );
				const bvhB = new MeshBVH( cubeB, { targetLeafSize: 1 } );

				matrix.makeRotationX( Math.PI * 0.01 );
				let nbTriangleTests = 0;
				const intersectsTriangles = function () {

					nbTriangleTests += 1;
					return false;

				};

				bvhA.bvhcast( bvhB, matrix, { intersectsTriangles: intersectsTriangles } );

				expect( nbTriangleTests ).toBe( 104 );

			} );

			it( 'should compare triangles that intersect after translation', () => {

				const bvhA = new MeshBVH( cubeA, { targetLeafSize: 1 } );
				const bvhB = new MeshBVH( cubeB, { targetLeafSize: 1 } );

				matrix.makeTranslation( 1, 1, 1 );
				let nbTriangleTests = 0;
				const intersectsTriangles = function () {

					nbTriangleTests += 1;
					return false;

				};

				bvhA.bvhcast( bvhB, matrix, { intersectsTriangles: intersectsTriangles } );

				expect( nbTriangleTests ).toBe( 24 );

			} );

			it( 'should compare all triangles in bounds that intersect', () => {

				const bvhA = new MeshBVH( cubeA, { targetLeafSize: 10 } );
				const bvhB = new MeshBVH( cubeB, { targetLeafSize: 10 } );

				matrix.makeRotationX( Math.PI * 0.01 );
				let nbTriangleTests = 0;
				const intersectsTriangles = function () {

					nbTriangleTests += 1;
					return false;

				};

				bvhA.bvhcast( bvhB, matrix, { intersectsTriangles: intersectsTriangles } );

				expect( nbTriangleTests ).toBe( 144 );

			} );


			it( 'should stop iterating triangles', () => {

				const bvhA = new MeshBVH( cubeA, { targetLeafSize: 10 } );
				const bvhB = new MeshBVH( cubeB, { targetLeafSize: 10 } );

				matrix.makeTranslation( 1, 1, 1 );
				let nbTriangleTests = 0;
				const intersectsTriangles = function () {

					nbTriangleTests += 1;
					return true;

				};

				bvhA.bvhcast( bvhB, matrix, { intersectsTriangles: intersectsTriangles } );

				expect( nbTriangleTests ).toBe( 1 );

			} );

		} );

		describe( 'Dense intersecting cubes', () => {

			let matrix;
			let bvhA, bvhB;
			beforeAll( () => {

				const cubeA = new BoxGeometry( 2, 2, 2, 2, 2, 2 );
				bvhA = new MeshBVH( cubeA, { targetLeafSize: 1 } );
				const cubeB = new BoxGeometry( 2, 2, 2, 2, 2, 2 );
				bvhB = new MeshBVH( cubeB, { targetLeafSize: 1 } );
				matrix = new Matrix4();

			} );

			it( 'should not compare all geometries triangles', () => {

				matrix.makeTranslation( 0, 1.5, 0 );
				let nbTriangleTests = 0;
				const intersectsTriangles = function () {

					nbTriangleTests += 1;
					return false;

				};

				bvhA.bvhcast( bvhB, matrix, { intersectsTriangles: intersectsTriangles } );

				// Each cube is composed of 2*2*2*6 = 48 triangles.
				// Only 1/4 geometry is intersected on 1 axis, so 24 triangles.
				// Worst case scenario is to compare 24 triangles to the 24 others (i.e. 576)
				// Since targetLeafSize === 1, triangle bounds have a size of (1,1,1) and
				// cube size is (2,2,2), each triangle should be compared to a *maximum*
				// of 16 others (8 on sides, 8 on front), i.e. 24x16 = 384.

				expect( nbTriangleTests ).toBeLessThanOrEqual( 384 );

			} );

		} );

	} );

	describe( 'IntersectsGeometry with BVH', () => {

		let bvh = null;
		let intersectGeometry = null;

		beforeAll( () => {

			const geom = new SphereGeometry( 1, 50, 50 );
			bvh = new MeshBVH( geom, { verbose: false } );
			intersectGeometry = new SphereGeometry( 1, 50, 50 );
			intersectGeometry.computeBoundsTree();

		} );

		it( 'should return true if the geometry is intersecting the mesh', () => {

			const geomToWorld = new Matrix4()
				.compose(
					new Vector3( 0, 1, 0 ),
					new Quaternion(),
					new Vector3( 0.1, 0.1, 0.1 ) );

			expect( bvh.intersectsGeometry( intersectGeometry, geomToWorld ) ).toBe( true );

		} );

		it( 'should return false if the geometry is not intersecting the mesh', () => {

			const geomToWorld = new Matrix4()
				.compose(
					new Vector3( 0, 1.2, 0 ),
					new Quaternion(),
					new Vector3( 0.1, 0.1, 0.1 ) );

			expect( bvh.intersectsGeometry( intersectGeometry, geomToWorld ) ).toBe( false );

		} );

		it( 'should return false if the geometry is contained by the mesh entirely', () => {

			const geomToWorld = new Matrix4()
				.compose(
					new Vector3( 0, 0, 0 ),
					new Quaternion(),
					new Vector3( 0.5, 0.5, 0.5 ) );

			expect( bvh.intersectsGeometry( intersectGeometry, geomToWorld ) ).toBe( false );

		} );

		it( 'should return true if the geometry overlaps exactly', () => {

			const geomToWorld = new Matrix4().identity();

			expect( bvh.intersectsGeometry( intersectGeometry, geomToWorld ) ).toBe( true );

		} );

	} );


	describe( 'IntersectsGeometry', () => {

		let bvh = null;
		let intersectGeometry = null;

		beforeAll( () => {

			const geom = new SphereGeometry( 1, 50, 50 );
			bvh = new MeshBVH( geom, { verbose: false } );
			intersectGeometry = new SphereGeometry( 1, 50, 50 );

		} );

		it( 'should return true if the geometry is intersecting the mesh', () => {

			const geomToWorld = new Matrix4()
				.compose(
					new Vector3( 0, 1, 0 ),
					new Quaternion(),
					new Vector3( 0.1, 0.1, 0.1 ) );

			expect( bvh.intersectsGeometry( intersectGeometry, geomToWorld ) ).toBe( true );

		} );

		it( 'should return false if the geometry is not intersecting the mesh', () => {

			const geomToWorld = new Matrix4()
				.compose(
					new Vector3( 0, 1.2, 0 ),
					new Quaternion(),
					new Vector3( 0.1, 0.1, 0.1 ) );

			expect( bvh.intersectsGeometry( intersectGeometry, geomToWorld ) ).toBe( false );

		} );

		it( 'should return false if the geometry is contained by the mesh entirely', () => {

			const geomToWorld = new Matrix4()
				.compose(
					new Vector3( 0, 0, 0 ),
					new Quaternion(),
					new Vector3( 0.5, 0.5, 0.5 ) );

			expect( bvh.intersectsGeometry( intersectGeometry, geomToWorld ) ).toBe( false );

		} );

		it( 'should return true if the geometry overlaps exactly', () => {

			const geomToWorld = new Matrix4().identity();

			expect( bvh.intersectsGeometry( intersectGeometry, geomToWorld ) ).toBe( true );

		} );

		it( 'should function even when the other geometry has no index.', () => {

			intersectGeometry = intersectGeometry.toNonIndexed();

			const geomToWorld = new Matrix4()
				.compose(
					new Vector3( 0, 1, 0 ),
					new Quaternion(),
					new Vector3( 0.1, 0.1, 0.1 ) );

			expect( bvh.intersectsGeometry( intersectGeometry, geomToWorld ) ).toBe( true );

		} );

	} );

	describe( 'IntersectsSphere', () => {

		let bvh = null;

		beforeAll( () => {

			const geom = new SphereGeometry( 1, 50, 50 );
			bvh = new MeshBVH( geom, { verbose: false } );

		} );

		it( 'should return true if the sphere is intersecting the mesh', () => {

			const sphere = new Sphere();
			sphere.radius = .01;
			sphere.center.set( 0, 1, 0 );
			expect( bvh.intersectsSphere( sphere ) ).toBe( true );

		} );

		it( 'should return false if the sphere is inside the mesh', () => {

			const sphere = new Sphere();
			sphere.radius = 0.9;
			sphere.center.set( 0, 0, 0 );
			expect( bvh.intersectsSphere( sphere ) ).toBe( false );

		} );

		it( 'should return false if the sphere is outside the mesh', () => {

			const sphere = new Sphere();
			sphere.radius = 0.9;
			sphere.center.set( 0, 2.01, 0 );
			expect( bvh.intersectsSphere( sphere ) ).toBe( false );

		} );

	} );

	describe( 'IntersectsBox', () => {

		let bvh = null;

		beforeAll( () => {

			const geom = new SphereGeometry( 1, 50, 50 );
			bvh = new MeshBVH( geom, { verbose: false } );

		} );

		it( 'should return false if the box is outside the mesh', () => {

			const box = new Box3();
			box.min.set( - 1, - 1, - 1 );
			box.max.set( 1, 1, 1 );

			const boxToWorld = new Matrix4()
				.compose(
					new Vector3( 0, 3, 0 ),
					new Quaternion().setFromEuler( new Euler( Math.PI / 4, Math.PI / 4, 0 ) ),
					new Vector3( 1, 1, 1 ) );

			expect( bvh.intersectsBox( box, boxToWorld ) ).toBe( false );

		} );

		it( 'should return true if one corner is inside the mesh', () => {

			const box = new Box3();
			box.min.set( - 1, - 1, - 1 );
			box.max.set( 1, 1, 1 );

			const boxToWorld = new Matrix4()
				.compose(
					new Vector3( 0, 2, 0 ),
					new Quaternion().setFromEuler( new Euler( Math.PI / 4, Math.PI / 4, 0 ) ),
					new Vector3( 1, 1, 1 ) );

			expect( bvh.intersectsBox( box, boxToWorld ) ).toBe( true );

		} );

		it( 'should return true if the box encapsulates the mesh entirely', () => {

			const box = new Box3();
			box.min.set( - 10, - 10, - 10 );
			box.max.set( 10, 10, 10 );

			const boxToWorld = new Matrix4()
				.compose(
					new Vector3( 0, 0, 0 ),
					new Quaternion().setFromEuler( new Euler( Math.PI / 4, Math.PI / 4, 0 ) ),
					new Vector3( 1, 1, 1 ) );

			expect( bvh.intersectsBox( box, boxToWorld ) ).toBe( true );

		} );

		it( 'should return false if the box inside the mesh entirely', () => {

			const box = new Box3();
			box.min.set( - .5, - .5, - .5 );
			box.max.set( .5, .5, .5 );

			const boxToWorld = new Matrix4()
				.compose(
					new Vector3( 0, 0, 0 ),
					new Quaternion().setFromEuler( new Euler( Math.PI / 4, Math.PI / 4, 0 ) ),
					new Vector3( 1, 1, 1 ) );

			expect( bvh.intersectsBox( box, boxToWorld ) ).toBe( false );

		} );

		it( 'should return true if the box intersects it with a side only', () => {

			const box = new Box3();
			box.min.set( - 10, 0, - 10 );
			box.max.set( 10, 10, 10 );

			const boxToWorld = new Matrix4()
				.compose(
					new Vector3( 0, 0, 0 ),
					new Quaternion().setFromEuler( new Euler( Math.PI / 4, Math.PI / 4, 0 ) ),
					new Vector3( 1, 1, 1 ) );

			expect( bvh.intersectsBox( box, boxToWorld ) ).toBe( true );

		} );

	} );

	describe( 'Distance To Point', () => {

		// error to account for the geometry
		// not being perfectly round
		const EPSILON = 0.001;
		let bvh = null;
		let target = undefined;

		beforeAll( () => {

			const geom = new SphereGeometry( 1, 200, 200 );
			bvh = new MeshBVH( geom, { verbose: false } );

		} );

		it( 'should return the radius if at the center of the geometry', () => {

			target = bvh.closestPointToPoint( new Vector3(), target );
			const dist = target.distance;
			expect( dist ).toBeLessThanOrEqual( 1 );
			expect( dist ).toBeGreaterThanOrEqual( 1 - EPSILON );

		} );

		it( 'should return 0 if on the surface of the geometry', () => {

			target = bvh.closestPointToPoint( new Vector3( 0, 1, 0 ), target );
			const dist = target.distance;
			expect( dist ).toBe( 0 );

		} );

		it( 'should return the distance to the surface', () => {

			const vec = new Vector3();
			for ( let i = 0; i < 100; i ++ ) {

				vec.x = Math.random() - 0.5;
				vec.y = Math.random() - 0.5;
				vec.z = Math.random() - 0.5;

				const length = Math.random() * 3;
				vec.normalize().multiplyScalar( length );

				const expectedDist = Math.abs( 1 - length );
				target = bvh.closestPointToPoint( vec, target );
				const dist = target.distance;
				expect( dist ).toBeLessThanOrEqual( expectedDist + EPSILON );
				expect( dist ).toBeGreaterThanOrEqual( expectedDist - EPSILON );

			}

		} );

	} );

	describe( 'Distance To Geometry', () => {

		let geometry = null;
		let bvh = null;
		let target1 = undefined;
		let target2 = undefined;

		beforeEach( () => {

			const geom = new SphereGeometry( 1, 20, 20 );
			bvh = new MeshBVH( geom, { verbose: false } );

			target2 = { };

			geometry = new SphereGeometry( 1, 5, 5 );

		} );

		it.todo( 'should check the the cases where other geo has and doesn\'t have a bvh' );

		it( 'should return the radius if reduced to a point at the center of the geometry', () => {

			// error to account for neither geometries
			// being perfectly round
			const EPSILON = 0.05;
			const matrix = new Matrix4()
				.compose(
					new Vector3(),
					new Quaternion(),
					new Vector3( 0.001, 0.001, 0.001 )
				);
			target1 = bvh.closestPointToGeometry( geometry, matrix, target1, target2 );
			const dist = target1.distance;
			expect( dist ).toBeLessThanOrEqual( 1 );
			expect( dist ).toBeGreaterThanOrEqual( 1 - EPSILON );

		} );

		it( 'should return 0 if intersecting the geometry', () => {

			const matrix = new Matrix4()
				.compose(
					new Vector3( 0, 1, 0 ),
					new Quaternion(),
					new Vector3( 0.1, 0.1, 0.1 )
				);
			target1 = bvh.closestPointToGeometry( geometry, matrix, target1, target2 );
			const dist = target1.distance;
			expect( dist ).toBe( 0 );

		} );


		it( 'should return the distance to the surface', () => {

			// error to account for neither geometries
			// being perfectly round
			const EPSILON = 0.1;
			const radius = 0.1;
			const pos = new Vector3();
			const quat = new Quaternion();
			const sca = new Vector3( radius, radius, radius );
			const matrix = new Matrix4();

			for ( let i = 0; i < 10; i ++ ) {

				pos.x = Math.random() - 0.5;
				pos.y = Math.random() - 0.5;
				pos.z = Math.random() - 0.5;

				const length = Math.random() * 3;
				pos.normalize().multiplyScalar( length );

				matrix.compose( pos, quat, sca );

				const distToCenter = Math.abs( 1 - length );
				const expectedDist = distToCenter < radius ? 0 : distToCenter - radius;
				target1 = bvh.closestPointToGeometry( geometry, matrix, target1, target2 );
				const dist = target1.distance;
				expect( dist ).toBeLessThanOrEqual( expectedDist + EPSILON );
				expect( dist ).toBeGreaterThanOrEqual( expectedDist - EPSILON );

			}

		} );

		for ( let n of [ 4, 8, 16 ] ) {

			it( `should handle case, n: ${n}`, () => {

				const geom = new SphereGeometry( 1, n * 2, n );
				const otherGeom = new SphereGeometry( 1, n * 2, n );
				geom.boundsTree = new MeshBVH( geom );
				const matrix = new Matrix4()
					.compose(
						new Vector3( 3, 0, 0 ),
						new Quaternion(),
						new Vector3( 1, 1, 1 )
					);

				const bvh1 = geom.boundsTree;

				const target1 = {};
				const target2 = {};
				bvh1.closestPointToGeometry( otherGeom, matrix, target1, target2 );
				const point1 = target1.point;
				const point2 = target2.point.applyMatrix4( matrix );
				const dist = point1.distanceTo( point2 );
				expect( dist ).toBeCloseTo( 1, 1 );

			} );

		}

		describe( 'coplanar overlapping triangles', () => {

			// two coplanar triangles where the second is fully contained in the first
			const tri1 = [[ 0, 0, 2 ], [ 4, 0, 2 ], [ 0, 4, 2 ]];
			const tri2 = [[ 1, 1, 2 ], [ 3, 1, 2 ], [ 1, 3, 2 ]];

			function makeGeometry( triangles, indexed ) {

				const positions = [];
				const index = [];
				for ( const triangle of triangles ) {

					const base = positions.length / 3;
					for ( const p of triangle ) positions.push( ...p );
					index.push( base, base + 1, base + 2 );

				}

				const geometry = new BufferGeometry();
				geometry.setAttribute( 'position', new BufferAttribute( new Float32Array( positions ), 3 ) );
				if ( indexed ) geometry.setIndex( index );

				return geometry;

			}

			function expectPointOnGeometry( point, geometry, faceIndex ) {

				const positions = geometry.attributes.position;
				const indices = geometry.index ? geometry.index.array : null;
				const a = indices ? indices[ faceIndex * 3 ] : faceIndex * 3;
				const b = indices ? indices[ faceIndex * 3 + 1 ] : faceIndex * 3 + 1;
				const c = indices ? indices[ faceIndex * 3 + 2 ] : faceIndex * 3 + 2;

				const triA = new Vector3().fromBufferAttribute( positions, a );
				const triB = new Vector3().fromBufferAttribute( positions, b );
				const triC = new Vector3().fromBufferAttribute( positions, c );

				const barycoord = Triangle.getBarycoord( point, triA, triB, triC, new Vector3() );
				expect( barycoord ).not.toBeNull();

				const EPSILON = 1e-5;
				expect( barycoord.x ).toBeGreaterThanOrEqual( - EPSILON );
				expect( barycoord.y ).toBeGreaterThanOrEqual( - EPSILON );
				expect( barycoord.z ).toBeGreaterThanOrEqual( - EPSILON );

			}

			for ( const indexed of [ false, true ] ) {

				it( `should return points on the overlap area and valid face indices (indexed: ${ indexed })`, () => {

					const geom = makeGeometry( [ tri1 ], indexed );
					const otherGeom = makeGeometry( [ tri2 ], indexed );
					const bvh = new MeshBVH( geom );
					geom.boundsTree = bvh;

					const target1 = {};
					const target2 = {};
					bvh.closestPointToGeometry( otherGeom, new Matrix4(), target1, target2 );

					expect( target1.distance ).toBe( 0 );
					expect( target2.distance ).toBe( 0 );
					expect( target1.point.distanceTo( target2.point ) ).toBeCloseTo( 0 );

					expectPointOnGeometry( target1.point, geom, target1.faceIndex );
					expectPointOnGeometry( target2.point, otherGeom, target2.faceIndex );

				} );

				it( `should match the triangle-level result (indexed: ${ indexed })`, () => {

					const geom = makeGeometry( [ tri1 ], indexed );
					const otherGeom = makeGeometry( [ tri2 ], indexed );
					const bvh = new MeshBVH( geom );
					geom.boundsTree = bvh;

					const triangle = new ExtendedTriangle(
						new Vector3( ...tri1[ 0 ] ),
						new Vector3( ...tri1[ 1 ] ),
						new Vector3( ...tri1[ 2 ] ),
					);
					const otherTriangle = new ExtendedTriangle(
						new Vector3( ...tri2[ 0 ] ),
						new Vector3( ...tri2[ 1 ] ),
						new Vector3( ...tri2[ 2 ] ),
					);

					const triTarget1 = new Vector3();
					const triTarget2 = new Vector3();
					expect( triangle.distanceToTriangle( otherTriangle, triTarget1, triTarget2 ) ).toBe( 0 );

					const target1 = {};
					const target2 = {};
					bvh.closestPointToGeometry( otherGeom, new Matrix4(), target1, target2 );

					expect( target1.point.distanceTo( triTarget1 ) ).toBeCloseTo( 0 );
					expect( target2.point.distanceTo( triTarget2 ) ).toBeCloseTo( 0 );

				} );

				it( `should return points on the overlap area when the other geometry has no bounds tree (indexed: ${ indexed })`, () => {

					const geom = makeGeometry( [ tri1 ], indexed );
					const otherGeom = makeGeometry( [ tri2 ], indexed );
					const bvh = new MeshBVH( geom );
					geom.boundsTree = bvh;
					expect( otherGeom.boundsTree ).toBeUndefined();

					const target1 = {};
					const target2 = {};
					bvh.closestPointToGeometry( otherGeom, new Matrix4(), target1, target2 );

					expect( target1.distance ).toBe( 0 );
					expect( target1.point.distanceTo( target2.point ) ).toBeCloseTo( 0 );
					expectPointOnGeometry( target1.point, geom, target1.faceIndex );
					expectPointOnGeometry( target2.point, otherGeom, target2.faceIndex );

				} );

			}

		} );

		describe( 'faceIndex consistency across build modes', () => {

			it( 'should return a face index usable with getTriangleHitPointInfo for every build mode', () => {

				const indirectModes = [ false, true ];
				for ( const indirect of indirectModes ) {

					// build a wall of 40 coplanar plates, 8 columns by 5 rows
					const positions = [];
					const index = [];
					for ( let i = 0; i < 40; i ++ ) {

						const x = ( i % 8 ) * 3;
						const y = Math.floor( i / 8 ) * 3;
						const z = ( i % 3 ) * 0.2;
						const base = positions.length / 3;
						positions.push( x, y, z, x + 1, y, z, x, y + 1, z );
						index.push( base, base + 1, base + 2 );

					}

					const geom = new BufferGeometry();
					geom.setAttribute( 'position', new BufferAttribute( new Float32Array( positions ), 3 ) );
					geom.setIndex( index );

					const bvh = new MeshBVH( geom, { indirect } );
					const ray = new Ray( new Vector3( 9.2, 3.2, 5 ), new Vector3( 0, 0, - 1 ) );

					// when the geometry index is left untouched the face index refers to the
					// original triangle, otherwise it refers to the reordered index buffer.
					const expectedFaceIndex = indirect ? 11 : 4;
					const rayHit = bvh.raycastFirst( ray );
					expect( rayHit.faceIndex ).toBe( expectedFaceIndex );
					expect( rayHit.distance ).toBeCloseTo( 4.6 );
					expect( rayHit.point.distanceTo( new Vector3( 9.2, 3.2, 0.4 ) ) ).toBeCloseTo( 0 );

					const closestHit = bvh.closestPointToPoint( new Vector3( 9.2, 3.2, 5 ) );
					expect( closestHit.faceIndex ).toBe( rayHit.faceIndex );
					expect( closestHit.point.distanceTo( rayHit.point ) ).toBeCloseTo( 0 );

					// a raised plate that sits one unit above the wall
					const otherGeom = new BufferGeometry();
					otherGeom.setAttribute( 'position', new BufferAttribute( new Float32Array( [
						9.2, 3.2, 1.4,
						9.8, 3.2, 1.4,
						9.2, 3.8, 1.4,
					] ), 3 ) );

					const target1 = {};
					const target2 = {};
					bvh.closestPointToGeometry( otherGeom, new Matrix4(), target1, target2 );
					expect( target1.faceIndex ).toBe( rayHit.faceIndex );
					expect( target1.distance ).toBeCloseTo( 1 );
					expect( target1.point.distanceTo( new Vector3( 9.2, 3.2, 0.4 ) ) ).toBeCloseTo( 0 );
					expect( target2.point.distanceTo( new Vector3( 9.2, 3.2, 1.4 ) ) ).toBeCloseTo( 0 );

					// the reported face index must identify the triangle the point is on
					const info = getTriangleHitPointInfo( target1.point, geom, target1.faceIndex );
					const { a, b, c } = info.face;
					const triangle = new Triangle(
						new Vector3().fromBufferAttribute( geom.attributes.position, a ),
						new Vector3().fromBufferAttribute( geom.attributes.position, b ),
						new Vector3().fromBufferAttribute( geom.attributes.position, c ),
					);
					const barycoord = Triangle.getBarycoord( target1.point, triangle.a, triangle.b, triangle.c, new Vector3() );
					expect( barycoord ).not.toBeNull();
					expect( barycoord.x ).toBeGreaterThanOrEqual( - 1e-5 );
					expect( barycoord.y ).toBeGreaterThanOrEqual( - 1e-5 );
					expect( barycoord.z ).toBeGreaterThanOrEqual( - 1e-5 );

				}

			} );

		} );

	} );

	describe( 'Raycaster', () => {

		let geometry = null;
		let mesh = null;
		let scene = null;
		let raycaster = null;
		beforeEach( () => {

			raycaster = new Raycaster();
			raycaster.ray.origin.set( 0, 0, - 10 );
			raycaster.ray.direction.set( 0, 0, 1 );

			scene = new Scene();
			geometry = new TorusGeometry( 5, 5, 40, 10 );
			mesh = new Mesh( geometry, new MeshBasicMaterial() );

			scene.add( mesh );

			for ( let i = 0; i < 10; i ++ ) {

				scene.add( mesh.clone() );

			}

		} );

		describe( 'firstHitOnly = false', () => {

			beforeEach( () => {

				raycaster.firstHitOnly = false;

			} );

			it( 'should yield all hits on an a mesh without a bounds tree', () => {

				const arr = [];
				mesh.raycast( raycaster, arr );
				expect( arr ).toHaveLength( 10 );

			} );

			it( 'should yield all hits on an a mesh with a bounds tree', () => {

				geometry.computeBoundsTree();

				const arr = [];
				mesh.raycast( raycaster, arr );
				expect( arr ).toHaveLength( 10 );

			} );

			it( 'should yield all hits in a scene', () => {

				const res = raycaster.intersectObject( scene, true );
				expect( res ).toHaveLength( 110 );

			} );

			it( 'should support correct use of groups', () => {

				const backSideMaterial = new MeshBasicMaterial( {
					side: BackSide,
				} );

				const frontSideMaterial = new MeshBasicMaterial( {
					side: FrontSide,
				} );

				const box = new Mesh(
					new BoxGeometry(),
					[
						backSideMaterial, frontSideMaterial,
						backSideMaterial, frontSideMaterial,
						backSideMaterial, frontSideMaterial,
					],
				);

				const raycaster = new Raycaster();
				raycaster.ray.origin.set( 0, 0.25, - 10 );
				raycaster.ray.direction.set( 0, 0, 1 );

				// all hits
				const results = raycaster.intersectObject( box, true );
				box.geometry.computeBoundsTree();
				const results2 = raycaster.intersectObject( box, true );

				expect( results ).toEqual( results2 );
				expect( results ).toHaveLength( 2 );

				// first hit
				raycaster.firstHitOnly = true;
				box.material = [
					frontSideMaterial, frontSideMaterial,
					frontSideMaterial, frontSideMaterial,
					backSideMaterial, backSideMaterial,
				];

				box.geometry.disposeBoundsTree();
				const firstHit = raycaster.intersectObject( box, true )[ 0 ];

				box.geometry.computeBoundsTree();
				const firstHit2 = raycaster.intersectObject( box, true )[ 0 ];

				expect( firstHit ).toEqual( firstHit2 );
				expect( firstHit.point.z ).toEqual( 0.5 );

			} );

			it( 'should not hit triangles in gaps between groups', () => {

				const boxGeometry = new BoxGeometry( 1, 1, 1 );

				// create groups such that the -X face is missing (triangles 6-11)
				boxGeometry.clearGroups();
				boxGeometry.addGroup( 0, 6, 0 );
				boxGeometry.addGroup( 12, 24, 1 );

				const bvh = new MeshBVH( boxGeometry );
				const boxMesh = new Mesh( boxGeometry, new MeshBasicMaterial() );
				boxMesh.geometry.boundsTree = bvh;

				// raycast towards the -X face
				const raycaster = new Raycaster();
				raycaster.ray.origin.set( - 2, 0, 0 );
				raycaster.ray.direction.set( 1, 0, 0 );

				// expect no hits because the -X face is excluded from groups
				const hits = raycaster.intersectObject( boxMesh );
				expect( hits ).toHaveLength( 0 );

			} );

		} );

		describe( 'firstHitOnly = true', () => {

			it( 'should yield closest hit only with a bounds tree', () => {

				const bvh = new MeshBVH( geometry );

				geometry.boundsTree = bvh;
				raycaster.firstHitOnly = true;
				const bvhHits = raycaster.intersectObject( mesh, true );

				raycaster.firstHitOnly = false;
				const allHits = raycaster.intersectObject( mesh, true );

				expect( allHits ).toHaveLength( 10 );
				expect( bvhHits ).toHaveLength( 1 );

				expect( bvhHits[ 0 ] ).toEqual( allHits[ 0 ] );

			} );

		} );

	} );

}
